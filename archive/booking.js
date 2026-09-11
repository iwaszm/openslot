const STORAGE_KEY = "openslot.barber.mvp.appointments";
const DEFAULT_SERVICES = [
  { id: "damen_haarschnitt", name: "Damen" },
  { id: "herren_haarschnitt", name: "Herren" },
  { id: "waschen_foehnen_styling", name: "Waschen, Fohnen, Styling" },
  { id: "haarefarben", name: "Haarefarben" },
  { id: "dauerwelle", name: "Dauerwelle" },
  { id: "pflegen", name: "Pflegen" },
  { id: "straehnen", name: "Strahnen" },
  { id: "blondierung", name: "Blondierung" },
  { id: "lonen_dauerwelle", name: "Lonen Dauerwelle" },
  { id: "digitale_dauerwelle", name: "Digitale Dauerwelle" },
];

const state = {
  booking: null,
  repository: null,
  services: DEFAULT_SERVICES,
  storageStatusKey: "common.detecting",
};

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
const getServiceName = (service) => service.name;
const confirmMessages = {
  cancelBooking: "Diesen Termin wirklich stornieren?",
};

const els = {
  lookupForm: document.querySelector("#lookupForm"),
  bookingIdInput: document.querySelector("#bookingIdInput"),
  bookingEmailInput: document.querySelector("#bookingEmailInput"),
  lookupMessage: document.querySelector("#lookupMessage"),
  bookingDetail: document.querySelector("#bookingDetail"),
  storageStatus: document.querySelector("#storageStatus"),
};

init();

async function init() {
  state.repository = createRepository();
  const params = new URLSearchParams(location.search);
  els.bookingIdInput.value = params.get("id") || "";
  els.bookingEmailInput.value = params.get("email") || "";
  els.lookupForm.addEventListener("submit", handleLookup);
  window.addEventListener("openslot:language-change", () => {
    els.storageStatus.textContent = t(state.storageStatusKey);
    if (state.booking) renderBooking();
  });

  if (els.bookingIdInput.value && els.bookingEmailInput.value) {
    await lookupBooking();
  }
}

function createRepository() {
  const config = window.OPENSLOT_SUPABASE || {};
  const hasSupabase = Boolean(window.supabase && config.url && config.anonKey);
  if (!hasSupabase) {
    state.storageStatusKey = "common.localDemo";
    els.storageStatus.textContent = t("common.localDemo");
    return createLocalRepository();
  }
  const client = window.supabase.createClient(config.url, config.anonKey);
  state.storageStatusKey = "common.supabase";
  els.storageStatus.textContent = t("common.supabase");
  return createSupabaseRepository(client);
}

async function handleLookup(event) {
  event.preventDefault();
  await lookupBooking();
}

async function lookupBooking(options = {}) {
  const { preserveMessage = false } = options;
  try {
    if (!preserveMessage) els.lookupMessage.textContent = t("lookup.searching");
    state.booking = await state.repository.getBooking(
      els.bookingIdInput.value.trim(),
      els.bookingEmailInput.value.trim(),
    );
    if (!state.booking) {
      els.bookingDetail.hidden = true;
      els.lookupMessage.textContent = t("lookup.notFound");
      return;
    }
    if (!preserveMessage) els.lookupMessage.textContent = "";
    renderBooking();
  } catch (error) {
    els.bookingDetail.hidden = true;
    els.lookupMessage.textContent = t("lookup.failed", { message: error.message });
  }
}

function renderBooking() {
  const booking = state.booking;
  const isCancelled = booking.status === "cancelled";
  els.bookingDetail.hidden = false;
  els.bookingDetail.innerHTML = `
    <div class="control-title">
      <strong>${isCancelled ? t("lookup.cancelledTitle") : t("lookup.detailTitle")}</strong>
      <small>${escapeHtml(booking.id)}</small>
    </div>
    <div class="detail-stack">
      <span>${t("lookup.service")}: ${escapeHtml(booking.serviceName)}</span>
      <span>${t("lookup.date")}: ${escapeHtml(booking.date)}</span>
      <span>${t("lookup.time")}: ${formatMinutes(booking.startMinutes)}-${formatMinutes(booking.endMinutes)}</span>
      <span>${t("lookup.name")}: ${escapeHtml(booking.name)}</span>
      <span>${t("lookup.status")}: ${isCancelled ? t("lookup.cancelled") : t("lookup.confirmed")}</span>
    </div>
    <button id="publicCancelButton" class="primary-action compact-action" type="button" ${isCancelled ? "disabled" : ""}>${t("lookup.cancelButton")}</button>
  `;

  const cancelButton = document.querySelector("#publicCancelButton");
  cancelButton?.addEventListener("click", handleCancelBooking);
}

async function handleCancelBooking() {
  if (!state.booking || state.booking.status === "cancelled") return;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Termin stornieren",
    message: confirmMessages.cancelBooking,
    confirmLabel: "Stornieren",
    tone: "danger",
  });
  if (!confirmed) return;
  try {
    await state.repository.cancelBooking(state.booking.id, els.bookingEmailInput.value.trim());
    const mailMessage = await state.repository.sendBookingEmail(state.booking.id, "cancelled");
    els.lookupMessage.textContent = mailMessage || "预约已取消。";
    await lookupBooking({ preserveMessage: true });
  } catch (error) {
    els.lookupMessage.textContent = t("lookup.cancelFailed", { message: error.message });
  }
}

function createSupabaseRepository(client) {
  return {
    async getBooking(id, email) {
      const { data, error } = await client.rpc("get_public_booking", {
        p_booking_id: id,
        p_email: email,
      });
      if (error) throw error;
      return data?.[0] ? fromPublicBooking(data[0]) : null;
    },
    async cancelBooking(id, email) {
      const { error } = await client.rpc("cancel_public_booking", {
        p_booking_id: id,
        p_email: email,
      });
      if (error) throw error;
    },
    async sendBookingEmail(bookingId, eventType) {
      const { error } = await client.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId, event_type: eventType },
      });
      return error ? `预约已取消，但邮件发送失败：${error.message}` : "预约已取消，确认邮件已发送。";
    },
  };
}

function createLocalRepository() {
  return {
    async getBooking(id, email) {
      const booking = loadLocalAppointments().find((item) => item.id === id && item.email === email);
      return booking ? { ...booking, serviceName: getServiceName(findLocalService(booking.serviceId)) } : null;
    },
    async cancelBooking(id, email) {
      const appointments = loadLocalAppointments();
      const next = appointments.map((item) => (
        item.id === id && item.email === email ? { ...item, status: "cancelled", cancelledBy: "customer" } : item
      ));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    async sendBookingEmail() {
      return "预约已取消。本地演示版不会发送邮件。";
    },
  };
}

function fromPublicBooking(row) {
  return {
    id: row.booking_id,
    serviceName: row.service_name,
    date: row.appointment_date,
    startMinutes: dateToMinutes(row.start_time),
    endMinutes: dateToMinutes(row.end_time),
    name: row.customer_name,
    status: row.status,
  };
}

function findLocalService(id) {
  return DEFAULT_SERVICES.find((service) => service.id === id) || { id, name: id };
}

function loadLocalAppointments() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function dateToMinutes(value) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
