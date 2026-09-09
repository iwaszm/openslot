const DEFAULT_SERVICES = [
  { id: "damen_haarschnitt", name: "Damen", duration: 45, price: 25, category: "cut", gender: "female", isActive: true },
  { id: "herren_haarschnitt", name: "Herren", duration: 30, price: 20, category: "cut", gender: "male", isActive: true },
  { id: "waschen_foehnen_styling", name: "Waschen, Fohnen, Styling", duration: 30, price: 15, category: "care", gender: "unisex", isActive: true },
  { id: "haarefarben", name: "Haarefarben", duration: 90, price: 30, category: "color", gender: "unisex", isActive: true },
  { id: "dauerwelle", name: "Dauerwelle", duration: 120, price: 35, category: "shape", gender: "unisex", isActive: true },
  { id: "pflegen", name: "Pflegen", duration: 30, price: 25, category: "care", gender: "unisex", isActive: true },
  { id: "straehnen", name: "Strahnen", duration: 90, price: 40, category: "color", gender: "unisex", isActive: true },
  { id: "blondierung", name: "Blondierung", duration: 120, price: 45, category: "color", gender: "unisex", isActive: true },
  { id: "lonen_dauerwelle", name: "Lonen Dauerwelle", duration: 150, price: 120, category: "shape", gender: "unisex", isActive: true },
  { id: "digitale_dauerwelle", name: "Digitale Dauerwelle", duration: 150, price: 100, category: "shape", gender: "unisex", isActive: true },
];
const SERVICE_ORDER = new Map(DEFAULT_SERVICES.map((service, index) => [service.id, index]));
const SERVICE_CATEGORY_LABELS = {
  cut: "Schnitt",
  color: "Farbe",
  shape: "Form",
  care: "Pflege",
};
const SERVICE_CATEGORY_ORDER = ["cut", "color", "shape", "care"];

const DEFAULT_OPEN_MINUTES = 10 * 60;
const DEFAULT_CLOSE_MINUTES = 18 * 60;
const SLOT_STEP = 30;
const DATE_RANGE_DAYS = 21;
const WEEKLY_HOURS = [
  { index: 1, key: "salon.day.monday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 2, key: "salon.day.tuesday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 3, key: "salon.day.wednesday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 4, key: "salon.day.thursday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 5, key: "salon.day.friday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 6, key: "salon.day.saturday", openMinutes: 10 * 60, closeMinutes: 17 * 60 },
  { index: 0, key: "salon.day.sunday", openMinutes: null, closeMinutes: null },
];
const STORAGE_KEY = "openslot.barber.mvp.appointments";
const SETTINGS_KEY = "openslot.barber.mvp.day-settings";
const BLOCKS_KEY = "openslot.barber.mvp.blocked-slots";
const SERVICES_KEY = "openslot.barber.mvp.services";
const LEGACY_SERVICE_IDS = new Set(["haircut", "color", "perm"]);

const state = {
  appointments: [],
  blockedSlots: [],
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  repository: null,
  services: DEFAULT_SERVICES,
  salon: null,
  dateOptions: [],
  selectedServiceId: DEFAULT_SERVICES[0].id,
  selectedGender: DEFAULT_SERVICES[0].gender,
  selectedSlot: "",
  storageStatusKey: "common.detecting",
};

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
const getServiceName = (service) => service.name;

const els = {
  bookingForm: document.querySelector("#bookingForm"),
  serviceOptions: document.querySelector("#serviceOptions"),
  dateStrip: document.querySelector("#dateStrip"),
  datePrevButton: document.querySelector("#datePrevButton"),
  dateNextButton: document.querySelector("#dateNextButton"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  slotGrid: document.querySelector("#slotGrid"),
  selectedSlotLabel: document.querySelector("#selectedSlotLabel"),
  bookingSummary: document.querySelector("#bookingSummary"),
  dateInput: document.querySelector("#dateInput"),
  genderInput: document.querySelector("#genderInput"),
  formMessage: document.querySelector("#formMessage"),
  submitButton: document.querySelector('.customer-booking .primary-action[type="submit"]'),
  turnstileWidget: document.querySelector("#turnstileWidget"),
  storageStatus: document.querySelector("#storageStatus"),
  customerName: document.querySelector("#customerName"),
  customerPhone: document.querySelector('[name="phone"]'),
  customerEmail: document.querySelector('[name="email"]'),
  openingHours: document.querySelector("#openingHours"),
  bookingResult: document.querySelector("#bookingResult"),
  salonName: document.querySelector("#salonName"),
  salonAddress: document.querySelector("#salonAddress"),
  salonPhone: document.querySelector("#salonPhone"),
};

window.onOpenSlotTurnstileChange = () => {
  updateSubmitState();
};

init();

async function init() {
  els.dateInput.value = getInitialBookingDate();
  els.dateInput.min = toDateInputValue(new Date());
  state.repository = createRepository();
  bindEvents();
  await refreshServices();
  await refreshDateOptions();
  await refreshDayData();
}

function bindEvents() {
  els.bookingForm.addEventListener("submit", handleSubmit);
  els.serviceOptions.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="service"]')) return;
    selectServiceInput(event.target);
  });
  els.serviceOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service-scroll]");
    if (button) {
      scrollServiceStrip(Number(button.dataset.serviceScroll));
      return;
    }
    const serviceCard = event.target.closest(".service-card");
    const serviceInput = serviceCard?.querySelector('input[name="service"]');
    if (!serviceInput) return;
    event.preventDefault();
    selectServiceInput(serviceInput);
  });
  els.customerName.addEventListener("input", () => {
    els.customerName.setCustomValidity("");
  });
  [els.customerPhone, els.customerEmail].forEach((field) => {
    field?.addEventListener("input", () => field.setCustomValidity(""));
  });
  els.datePrevButton?.addEventListener("click", () => scrollDateStrip(-1));
  els.dateNextButton?.addEventListener("click", () => scrollDateStrip(1));
  els.dateInput.addEventListener("change", async () => {
    state.selectedSlot = "";
    await refreshDateOptions();
    await refreshDayData();
  });
  window.addEventListener("openslot:language-change", () => {
    if (els.storageStatus) els.storageStatus.textContent = t(state.storageStatusKey);
    render();
    renderServices();
    renderDateStrip();
  });
}

function createRepository() {
  const config = window.OPENSLOT_SUPABASE || {};
  const hasSupabase = Boolean(window.supabase && config.url && config.anonKey);
  if (!hasSupabase) {
    state.storageStatusKey = "common.localDemo";
    if (els.storageStatus) els.storageStatus.textContent = t("common.localDemo");
    return createLocalRepository();
  }

  const client = window.supabase.createClient(config.url, config.anonKey);
  state.storageStatusKey = "common.supabase";
  if (els.storageStatus) els.storageStatus.textContent = t("common.supabase");
  return createSupabaseRepository(client);
}

async function refreshServices() {
  try {
    state.services = await state.repository.listServices();
    const selected = state.services.find((service) => service.id === state.selectedServiceId);
    if (!selected?.isActive) state.selectedServiceId = activeServices()[0]?.id || "";
  } catch (error) {
    state.services = DEFAULT_SERVICES;
    els.formMessage.textContent = `读取服务失败：${error.message}`;
  }
  renderServices();
}

async function refreshDateOptions() {
  const dates = buildDateRange(els.dateInput.value);
  try {
    const settings = await Promise.all(dates.map((date) => state.repository.getDaySettings(date)));
    state.dateOptions = dates.map((date, index) => ({
      date,
      settings: settings[index],
      isBusinessDay: isBusinessDay(settings[index]),
    }));
    const selectedOption = state.dateOptions.find((option) => option.date === els.dateInput.value);
    const firstBusinessDay = state.dateOptions.find((option) => option.isBusinessDay);
    if (selectedOption && !selectedOption.isBusinessDay && firstBusinessDay) {
      els.dateInput.value = firstBusinessDay.date;
    }
  } catch (error) {
    state.dateOptions = dates.map((date) => {
      const settings = createDefaultDaySettings(date);
      return {
        date,
        settings,
        isBusinessDay: isBusinessDay(settings),
      };
    });
  }
  renderDateStrip();
}

async function refreshDayData(options = {}) {
  const { shouldRender = true } = options;
  try {
    const date = els.dateInput.value;
    const [appointments, daySettings, blockedSlots] = await Promise.all([
      state.repository.listAppointments(date),
      state.repository.getDaySettings(date),
      state.repository.listBlockedSlots(date),
    ]);
    state.appointments = appointments;
    state.daySettings = daySettings;
    state.blockedSlots = blockedSlots;
  } catch (error) {
    els.formMessage.textContent = `读取排班失败：${error.message}`;
  }
  if (shouldRender) render();
}

function render() {
  renderSalonInfo();
  renderOpeningHours();
  renderDateStrip();
  renderSelectedSummaries();
  renderSlots();
}

function renderSalonInfo() {
  if (!state.salon) return;
  if (els.salonName) els.salonName.textContent = state.salon.name || t("salon.name");
  if (els.salonAddress) els.salonAddress.textContent = state.salon.address || "";
  if (els.salonPhone) {
    const phone = state.salon.phone || "";
    els.salonPhone.textContent = phone;
    els.salonPhone.href = `tel:${normalizePhoneHref(phone)}`;
  }
}

function renderOpeningHours() {
  if (state.salon?.opening_hours) {
    renderSalonOpeningHours(state.salon.opening_hours);
    return;
  }
  const today = getWeeklyRule(new Date());
  els.openingHours.innerHTML = `
    <details class="hours-details">
      <summary>
        <span>${t(today.key)}</span>
        <strong>${formatWeeklyHours(today)}</strong>
      </summary>
      <dl class="weekly-hours">
        ${WEEKLY_HOURS.map((day) => `
          <div class="${day.openMinutes === null ? "closed-day" : ""}">
            <dt>${t(day.key)}</dt>
            <dd>${formatWeeklyHours(day)}</dd>
          </div>
        `).join("")}
      </dl>
    </details>
  `;
}

function renderSalonOpeningHours(openingHours) {
  const rows = normalizeOpeningHours(openingHours);
  const todayKey = getOpeningHoursTodayKey();
  els.openingHours.innerHTML = `
    <details class="hours-details">
      <summary>
        <span>${escapeHtml(rows[todayKey].label)}</span>
        <strong>${escapeHtml(rows[todayKey].hours)}</strong>
      </summary>
      <dl class="weekly-hours">
        ${Object.values(rows).map((day) => `
          <div class="${day.hours === "geschlossen" || day.hours === "closed" ? "closed-day" : ""}">
            <dt>${escapeHtml(day.label)}</dt>
            <dd>${escapeHtml(day.hours)}</dd>
          </div>
        `).join("")}
      </dl>
    </details>
  `;
}

function normalizeOpeningHours(openingHours) {
  return {
    monday: { label: t("salon.day.monday"), hours: openingHours.monday || "10:00-18:00" },
    tuesday: { label: t("salon.day.tuesday"), hours: openingHours.tuesday || "10:00-18:00" },
    wednesday: { label: t("salon.day.wednesday"), hours: openingHours.wednesday || "10:00-18:00" },
    thursday: { label: t("salon.day.thursday"), hours: openingHours.thursday || "10:00-18:00" },
    friday: { label: t("salon.day.friday"), hours: openingHours.friday || "10:00-18:00" },
    saturday: { label: t("salon.day.saturday"), hours: openingHours.saturday || "10:00-17:00" },
    sunday: { label: t("salon.day.sunday"), hours: openingHours.sunday || t("salon.closed") },
  };
}

function getOpeningHoursTodayKey() {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date().getDay()];
}

function formatWeeklyHours(day) {
  return day.openMinutes === null ? t("salon.closed") : `${formatMinutes(day.openMinutes)}-${formatMinutes(day.closeMinutes)}`;
}

function normalizePhoneHref(phone) {
  return String(phone).replace(/[^\d+]/g, "");
}

function renderServices() {
  const services = activeServices();
  if (services.length === 0) {
    state.selectedServiceId = "";
    els.serviceOptions.innerHTML = `<div class="empty-state compact-empty">${t("customer.noServices")}</div>`;
    return;
  }

  const serviceGroups = groupServicesByCategory(services);
  els.serviceOptions.innerHTML = `
    <div class="service-strip-shell">
      <button class="service-nav-button" type="button" data-service-scroll="-1" aria-label="Previous services">‹</button>
      <div class="service-carousel" aria-label="${t("booking.serviceLegend")}">
        ${serviceGroups.map((group) => `
          <section class="service-group" aria-label="${escapeHtml(group.label)}">
            <h3>${escapeHtml(group.label)}</h3>
            <div class="service-group-grid">
              ${group.services.map((service) => {
        const serviceGender = service.gender === "male" ? "male" : "female";
        const checked = service.id === state.selectedServiceId;
        const fallbackChecked = !state.selectedServiceId && service.id === services[0]?.id;
        return `
          <label class="service-card">
            <input type="radio" name="service" value="${service.id}" data-gender="${serviceGender}" ${checked || fallbackChecked ? "checked" : ""} />
            <strong>${escapeHtml(getServiceName(service))}</strong>
            <small>${t("customer.serviceMeta", { duration: service.duration, price: Number(service.price).toFixed(0) })}</small>
          </label>
        `;
        }).join("")}
            </div>
          </section>
        `).join("")}
      </div>
      <button class="service-nav-button" type="button" data-service-scroll="1" aria-label="Next services">›</button>
    </div>
  `;
}

function groupServicesByCategory(services) {
  const byCategory = new Map(SERVICE_CATEGORY_ORDER.map((category) => [
    category,
    {
      category,
      label: SERVICE_CATEGORY_LABELS[category],
      services: [],
    },
  ]));
  services.forEach((service) => {
    const category = getServiceCategory(service);
    if (!byCategory.has(category)) {
      byCategory.set(category, {
        category,
        label: SERVICE_CATEGORY_LABELS[category] || "Services",
        services: [],
      });
    }
    byCategory.get(category).services.push(service);
  });
  return Array.from(byCategory.values()).filter((group) => group.services.length > 0);
}

function getServiceCategory(service) {
  if (SERVICE_CATEGORY_LABELS[service.category]) return service.category;
  return "care";
}

function selectServiceInput(input) {
  if (!input || state.selectedServiceId === input.value) {
    resetPageHorizontalScroll();
    return;
  }
  input.checked = true;
  state.selectedServiceId = input.value;
  state.selectedGender = input.dataset.gender || state.selectedGender;
  els.genderInput.value = state.selectedGender;
  state.selectedSlot = "";
  render();
  resetPageHorizontalScroll();
}

function renderDateStrip() {
  if (!els.dateStrip) return;
  if (state.dateOptions.length === 0) return;

  const previousDateRow = els.dateStrip.querySelector(".date-row");
  const previousScrollLeft = previousDateRow ? previousDateRow.scrollLeft : 0;
  const selectedDate = new Date(`${els.dateInput.value}T00:00:00`);
  const monthLabel = formatDateMonthHeading(selectedDate);
  els.dateStrip.innerHTML = `
    <div class="date-month-heading">${escapeHtml(monthLabel)}</div>
    <div class="date-row">
      ${state.dateOptions.map((option) => {
    const date = new Date(`${option.date}T00:00:00`);
    const isSelected = option.date === els.dateInput.value;
    const label = formatDateButtonLabel(date);
    const classes = [
      "date-button",
      isSelected ? "selected" : "",
      option.isBusinessDay ? "" : "closed",
    ].filter(Boolean).join(" ");
    return `
      <button class="${classes}" type="button" data-date="${option.date}" ${option.isBusinessDay ? "" : "disabled"}>
        <span class="date-weekday">${escapeHtml(label.weekday)}</span>
        <strong>${escapeHtml(label.day)}</strong>
      </button>
    `;
  }).join("")}
    </div>
  `;

  const dateRow = els.dateStrip.querySelector(".date-row");
  if (dateRow && previousScrollLeft > 0) {
    const maxScrollLeft = Math.max(0, dateRow.scrollWidth - dateRow.clientWidth);
    const restoredScrollLeft = Math.min(previousScrollLeft, maxScrollLeft);
    dateRow.style.scrollBehavior = "auto";
    dateRow.scrollLeft = restoredScrollLeft;
    requestAnimationFrame(() => {
      dateRow.style.scrollBehavior = "";
    });
  }

  els.dateStrip.querySelectorAll(".date-button:not(:disabled)").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.date === els.dateInput.value) return;
      els.dateInput.value = button.dataset.date;
      state.selectedSlot = "";
      renderSelectedSummaries();
      await refreshDayData();
    });
  });
}

function renderSlots() {
  const service = getSelectedService();
  if (!service) {
    els.slotGrid.innerHTML = `<div class="empty-state compact-empty">${t("customer.noServices")}</div>`;
    return;
  }

  const allSlots = buildSlots(els.dateInput.value, service.duration);
  const availableSlots = allSlots.filter((slot) => slot.available);
  if (availableSlots.length === 0) {
    els.slotGrid.innerHTML = `<div class="empty-state compact-empty">${getNoSlotMessage(allSlots)}</div>`;
    renderSelectedSummaries();
    return;
  }

  els.slotGrid.innerHTML = `
    <div class="slot-row">
      ${availableSlots.map((slot) => {
    const classes = [
      "slot-button",
      "available",
      slot.time === state.selectedSlot ? "selected" : "",
    ].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-slot="${slot.time}" title="${t("booking.slotFree")}"><span>${slot.time}</span></button>`;
      }).join("")}
    </div>
  `;

  els.slotGrid.querySelectorAll(".slot-button.available").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSlot = button.dataset.slot;
      els.formMessage.textContent = "";
      renderSelectedSummaries();
      renderSlots();
    });
  });
}

function renderSelectedSummaries() {
  if (els.selectedDateLabel) els.selectedDateLabel.textContent = "";
  if (els.selectedSlotLabel) els.selectedSlotLabel.textContent = "";
  if (els.bookingSummary) els.bookingSummary.innerHTML = renderBookingSummary();
  updateSubmitState();
}

function updateSubmitState() {
  if (!els.submitButton) return;
  const needsTurnstile = Boolean(els.turnstileWidget && state.repository?.requiresTurnstile);
  const hasTurnstile = !needsTurnstile || Boolean(getTurnstileToken({ silent: true }));
  els.submitButton.disabled = !(getSelectedService() && els.dateInput.value && state.selectedSlot && hasTurnstile);
}

function renderBookingSummary() {
  const service = getSelectedService();
  if (!service) return "";
  const serviceName = getServiceName(service);
  const serviceMeta = t("customer.serviceMeta", { duration: service.duration, price: Number(service.price).toFixed(0) });
  const dateLabel = formatSelectedDateLabel(els.dateInput.value);
  const timeLabel = state.selectedSlot ? formatSelectedTimeRange(service) : t("booking.summaryNoTime");
  return `
    <span><strong>${escapeHtml(serviceName)}</strong><small>${escapeHtml(serviceMeta)}</small></span>
    <span>${escapeHtml(dateLabel)}</span>
    <span>${escapeHtml(timeLabel)}</span>
  `;
}

function formatSelectedTimeRange(service) {
  const startMinutes = parseTime(state.selectedSlot);
  return `${formatMinutes(startMinutes)}-${formatMinutes(startMinutes + service.duration)}`;
}

async function handleSubmit(event) {
  event.preventDefault();
  const invalidField = validateCustomerFields();
  if (invalidField) {
    invalidField.reportValidity();
    return;
  }

  if (!state.selectedSlot) {
    const service = getSelectedService();
    const slots = service ? buildSlots(els.dateInput.value, service.duration) : [];
    els.formMessage.textContent = getNoSlotMessage(slots);
    return;
  }

  const formData = new FormData(els.bookingForm);
  const service = getSelectedService();
  const startMinutes = parseTime(state.selectedSlot);
  const appointment = {
    date: els.dateInput.value,
    serviceId: service.id,
    gender: formData.get("gender"),
    name: String(formData.get("name")).trim(),
    phone: String(formData.get("phone")).trim(),
    email: String(formData.get("email")).trim(),
    startMinutes,
    endMinutes: startMinutes + service.duration,
    status: "confirmed",
  };

  await refreshDayData({ shouldRender: false });

  const slotError = validateBookingSlot(appointment);
  if (slotError) {
    els.formMessage.textContent = slotError;
    state.selectedSlot = "";
    renderSlots();
    return;
  }

  if (state.repository.requiresTurnstile) {
    appointment.turnstileToken = getTurnstileToken();
    if (!appointment.turnstileToken) {
      els.formMessage.textContent = "Bitte bestaetige, dass du kein Bot bist.";
      updateSubmitState();
      return;
    }
  }

  try {
    const bookingId = await state.repository.createAppointment(appointment);
    const selectedDate = els.dateInput.value;
    els.bookingForm.reset();
    els.dateInput.value = selectedDate;
    state.selectedSlot = "";
    state.selectedServiceId = activeServices()[0]?.id || "";
    state.selectedGender = "male";
    els.genderInput.value = state.selectedGender;
    resetTurnstile();
    const mailMessage = await state.repository.sendBookingEmail(bookingId, "created");
    renderBookingResult();
    els.formMessage.textContent = mailMessage || "";
    await refreshDayData();
    renderServices();
  } catch (error) {
    resetTurnstile();
    els.formMessage.textContent = getBookingErrorMessage(error);
    await refreshDayData();
  }
}

function renderBookingResult() {
  els.bookingResult.hidden = false;
  els.bookingResult.innerHTML = `
    <strong>Termin bestätigt</strong>
    <span>Bitte prüfen Sie Ihre E-Mail.</span>
  `;
}

function createSupabaseRepository(client) {
  const salonPromise = loadCurrentSalon(client);
  return {
    requiresTurnstile: true,
    async listServices() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("services")
        .select("id, name, duration_minutes, price, is_active, category")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseService);
    },
    async listAppointments(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("appointments")
        .select("id, service_id, appointment_date, start_time, end_time, status")
        .eq("salon_id", salon.id)
        .eq("appointment_date", date)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseAppointment);
    },
    async createAppointment(appointment) {
      const salon = await salonPromise;
      const { data, error } = await client.functions.invoke("create-booking", {
        body: {
          salon_slug: salon.slug,
          service_id: appointment.serviceId,
          appointment_date: appointment.date,
          start_time: `${formatMinutes(appointment.startMinutes)}:00`,
          gender: appointment.gender,
          name: appointment.name,
          phone: appointment.phone,
          email: appointment.email,
          turnstile_token: appointment.turnstileToken,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.booking_id;
    },
    async sendBookingEmail(bookingId, eventType) {
      const { data, error } = await client.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId, event_type: eventType },
      });
      if (error) return t("customer.emailSendFailed", { message: error.message });
      const failed = data?.results?.find((result) => result.status === "failed");
      return failed ? t("customer.emailSendFailed", { message: failed.error || "unknown error" }) : "";
    },
    async getDaySettings(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("shop_day_settings")
        .select("setting_date, open_time, close_time, is_blocked_day")
        .eq("salon_id", salon.id)
        .eq("setting_date", date)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeDaySettings(fromSupabaseDaySettings(data)) : createDefaultDaySettings(date);
    },
    async listBlockedSlots(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("blocked_slots")
        .select("id, block_date, start_time, end_time, reason")
        .eq("salon_id", salon.id)
        .eq("block_date", date)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseBlockedSlot);
    },
  };
}

async function loadCurrentSalon(client) {
  const slug = getCurrentSalonSlug();
  const { data, error } = await client
    .from("salons")
    .select("id, slug, name, address, phone, timezone, opening_hours")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`找不到店铺：${slug}`);
  state.salon = data;
  return data;
}

function getCurrentSalonSlug() {
  const segment = window.location.pathname.split("/").filter(Boolean)[0];
  if (!segment || segment.endsWith(".html")) return "lisa";
  return decodeURIComponent(segment).trim() || "lisa";
}

function createLocalRepository() {
  return {
    requiresTurnstile: false,
    async listServices() {
      return loadLocalServices().filter((service) => service.isActive);
    },
    async listAppointments(date) {
      return loadLocalAppointments().filter((appointment) => appointment.date === date);
    },
    async createAppointment(appointment) {
      const appointments = loadLocalAppointments();
      if (hasOverlap(appointment, appointments.filter((item) => item.date === appointment.date))) {
        throw new Error("Slot conflict");
      }
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      appointments.push({ ...appointment, id });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
      return id;
    },
    async sendBookingEmail() {
      return t("customer.localNoEmail");
    },
    async getDaySettings(date) {
      return normalizeDaySettings(loadLocalSettings()[date] || createDefaultDaySettings(date));
    },
    async listBlockedSlots(date) {
      return loadLocalBlocks().filter((block) => block.date === date);
    },
  };
}

function getTurnstileToken(options = {}) {
  const { silent = false } = options;
  if (!els.turnstileWidget) return "";
  const formToken = els.bookingForm?.querySelector('input[name="cf-turnstile-response"]')?.value || "";
  const token = formToken || window.turnstile?.getResponse?.(els.turnstileWidget) || window.turnstile?.getResponse?.() || "";
  if (!token && !silent) {
    els.formMessage.textContent = "Bitte schliesse die Sicherheitspruefung ab.";
  }
  return token;
}

function resetTurnstile() {
  if (!els.turnstileWidget) return;
  window.turnstile?.reset?.(els.turnstileWidget);
  updateSubmitState();
}

function buildSlots(date, duration) {
  if (state.daySettings.isBlockedDay) return [];
  const slots = [];
  for (let start = state.daySettings.openMinutes; start + duration <= state.daySettings.closeMinutes; start += SLOT_STEP) {
    const candidate = { date, startMinutes: start, endMinutes: start + duration };
    const isPast = isPastSlot(date, start);
    const appointmentOverlap = hasOverlap(candidate, state.appointments);
    const ownerBlocked = hasOverlap(candidate, state.blockedSlots);
    const reason = getSlotReason({ isPast, appointmentOverlap, ownerBlocked });
    slots.push({
      time: formatMinutes(start),
      available: !reason,
      isPast,
      reason,
    });
  }
  return slots;
}

function getSlotReason({ isPast, appointmentOverlap, ownerBlocked }) {
  if (isPast) return "Vergangen";
  if (appointmentOverlap) return "Belegt";
  if (ownerBlocked) return "Blockiert";
  return "";
}

function getNoSlotMessage(slots) {
  if (!getSelectedService()) return "Aktuell ist kein buchbarer Service verfügbar.";
  if (state.daySettings.isBlockedDay) return "Dieser Tag ist nicht für Buchungen geöffnet. Bitte wähle ein anderes Datum.";
  if (slots.length === 0) return "Der gewählte Service passt nicht in die Öffnungszeiten dieses Tages.";
  if (slots.every((slot) => slot.isPast)) return "Für heute sind keine späteren Termine mehr verfügbar.";
  if (slots.every((slot) => slot.reason === "Belegt")) return "Alle passenden Zeiten für diesen Service sind bereits belegt.";
  if (slots.every((slot) => slot.reason === "Blockiert")) return "Alle passenden Zeiten für diesen Service wurden blockiert.";
  return "Bitte wähle eine verfügbare Uhrzeit.";
}

function validateBookingSlot(appointment) {
  if (state.daySettings.isBlockedDay) return "Dieser Tag ist nicht für Buchungen geöffnet.";
  if (appointment.startMinutes < state.daySettings.openMinutes || appointment.endMinutes > state.daySettings.closeMinutes) return "Diese Uhrzeit liegt außerhalb der Öffnungszeiten.";
  if (hasOverlap(appointment, state.appointments)) return "Diese Uhrzeit wurde gerade belegt. Bitte wähle eine andere Zeit.";
  if (hasOverlap(appointment, state.blockedSlots)) return "Diese Uhrzeit wurde blockiert. Bitte wähle eine andere Zeit.";
  return "";
}

function getSelectedService() {
  return state.services.find((service) => service.id === state.selectedServiceId) || activeServices()[0];
}

function activeServices() {
  return state.services
    .filter((service) => service.isActive)
    .slice()
    .sort((a, b) => (getServiceSortIndex(a.id) - getServiceSortIndex(b.id)) || a.name.localeCompare(b.name));
}

function getServiceSortIndex(id) {
  return SERVICE_ORDER.get(stripSalonPrefix(id)) ?? 999;
}

function hasOverlap(candidate, ranges) {
  return ranges.some((range) => range.status !== "cancelled" && candidate.startMinutes < range.endMinutes && candidate.endMinutes > range.startMinutes);
}

function createDefaultDaySettings(date) {
  return normalizeDaySettings({ date, openMinutes: DEFAULT_OPEN_MINUTES, closeMinutes: DEFAULT_CLOSE_MINUTES, isBlockedDay: false });
}

function normalizeDaySettings(settings) {
  const weeklyRule = getWeeklyRule(new Date(`${settings.date}T00:00:00`));
  if (weeklyRule.openMinutes === null) {
    return { ...settings, openMinutes: DEFAULT_OPEN_MINUTES, closeMinutes: DEFAULT_CLOSE_MINUTES, isBlockedDay: true };
  }
  return {
    ...settings,
    openMinutes: weeklyRule.openMinutes,
    closeMinutes: weeklyRule.closeMinutes,
  };
}

function isBusinessDay(settings) {
  const weeklyRule = getWeeklyRule(new Date(`${settings.date}T00:00:00`));
  return weeklyRule.openMinutes !== null && !settings.isBlockedDay && settings.closeMinutes > settings.openMinutes;
}

function buildDateRange(selectedDate) {
  const today = new Date(`${toDateInputValue(new Date())}T00:00:00`);
  return Array.from({ length: DATE_RANGE_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return toDateInputValue(date);
  });
}

function getWeeklyRule(date) {
  return WEEKLY_HOURS.find((day) => day.index === date.getDay()) || WEEKLY_HOURS[0];
}

function formatDateButtonLabel(date) {
  const lang = window.OpenSlotI18n?.language || "zh";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return {
    weekday,
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
  };
}

function formatDateMonthHeading(date) {
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
}

function formatSelectedDateLabel(dateValue) {
  if (!dateValue) return "";
  const lang = window.OpenSlotI18n?.language || "zh";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  const date = new Date(`${dateValue}T00:00:00`);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  return `${dateValue} ${weekday}`;
}

function scrollDateStrip(direction) {
  const dateRow = els.dateStrip?.querySelector(".date-row");
  if (!dateRow) return;
  const amount = Math.max(dateRow.clientWidth * 0.78, 240);
  dateRow.scrollBy({ left: direction * amount, behavior: "smooth" });
}

function scrollServiceStrip(direction) {
  const serviceRow = els.serviceOptions?.querySelector(".service-carousel");
  if (!serviceRow) return;
  const amount = Math.max(serviceRow.clientWidth * 0.78, 220);
  serviceRow.scrollBy({ left: direction * amount, behavior: "smooth" });
}

function resetPageHorizontalScroll() {
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  window.scrollTo(0, window.scrollY);
}

function fromSupabaseService(row) {
  const fallback = DEFAULT_SERVICES.find((service) => service.id === stripSalonPrefix(row.id));
  return {
    id: row.id,
    name: row.name,
    duration: row.duration_minutes,
    price: Number(row.price),
    category: row.category || fallback?.category || "care",
    gender: fallback?.gender || row.gender || "unisex",
    isActive: row.is_active,
  };
}

function stripSalonPrefix(id) {
  return String(id || "").replace(/^(lisa|liyong)_/, "");
}

function fromSupabaseAppointment(row) {
  return {
    id: row.id,
    date: row.appointment_date,
    serviceId: row.service_id,
    startMinutes: dateToMinutes(row.start_time),
    endMinutes: dateToMinutes(row.end_time),
    status: row.status,
  };
}

function fromSupabaseDaySettings(row) {
  return {
    date: row.setting_date,
    openMinutes: parseTime(row.open_time.slice(0, 5)),
    closeMinutes: parseTime(row.close_time.slice(0, 5)),
    isBlockedDay: row.is_blocked_day,
  };
}

function fromSupabaseBlockedSlot(row) {
  return {
    id: row.id,
    date: row.block_date,
    startMinutes: parseTime(row.start_time.slice(0, 5)),
    endMinutes: parseTime(row.end_time.slice(0, 5)),
    reason: row.reason || "",
  };
}

function loadLocalAppointments() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function loadLocalSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
}

function loadLocalBlocks() {
  return JSON.parse(localStorage.getItem(BLOCKS_KEY) || "[]");
}

function loadLocalServices() {
  const services = JSON.parse(localStorage.getItem(SERVICES_KEY) || JSON.stringify(DEFAULT_SERVICES));
  if (services.length === 3 && services.every((service) => LEGACY_SERVICE_IDS.has(service.id))) {
    localStorage.setItem(SERVICES_KEY, JSON.stringify(DEFAULT_SERVICES));
    return DEFAULT_SERVICES;
  }
  return services.map((service) => {
    const fallback = DEFAULT_SERVICES.find((item) => item.id === service.id);
    const prefixedFallback = DEFAULT_SERVICES.find((item) => item.id === stripSalonPrefix(service.id));
    return {
      ...service,
      category: service.category || fallback?.category || prefixedFallback?.category || "care",
      gender: service.gender || fallback?.gender || prefixedFallback?.gender || "unisex",
    };
  });
}

function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function getInitialBookingDate() {
  const now = new Date();
  const weeklyRule = getWeeklyRule(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const candidate = new Date(now);
  if (weeklyRule.openMinutes === null || currentMinutes >= weeklyRule.closeMinutes - SLOT_STEP) {
    candidate.setDate(candidate.getDate() + 1);
  }
  for (let offset = 0; offset < DATE_RANGE_DAYS; offset += 1) {
    const rule = getWeeklyRule(candidate);
    if (rule.openMinutes !== null) return toDateInputValue(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return toDateInputValue(candidate);
}

function dateToMinutes(value) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function parseTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isPastSlot(date, startMinutes) {
  const today = toDateInputValue(new Date());
  if (date !== today) return false;
  const now = new Date();
  return startMinutes <= now.getHours() * 60 + now.getMinutes();
}

function isConflictError(error) {
  return ["23P01", "P0001", "23514"].includes(error.code) || /conflict|prevent_double_booking|not available|outside working hours|blocked/i.test(error.message || "");
}

function getBookingErrorMessage(error) {
  const message = error.message || "";
  if (/outside working hours/i.test(message)) return "Buchung fehlgeschlagen: Diese Uhrzeit liegt außerhalb der Öffnungszeiten. Bitte aktualisiere die Seite und wähle neu.";
  if (/This day is not available/i.test(message)) return "Buchung fehlgeschlagen: Dieser Tag ist nicht für Buchungen geöffnet.";
  if (/blocked slot/i.test(message)) return "Buchung fehlgeschlagen: Diese Uhrzeit wurde blockiert.";
  if (/prevent_double_booking|conflict|overlap/i.test(message)) return "Buchung fehlgeschlagen: Diese Uhrzeit wurde gerade belegt. Bitte wähle eine andere Zeit.";
  if (/Unknown or inactive service/i.test(message)) return "Buchung fehlgeschlagen: Dieser Service ist nicht mehr aktiv. Bitte aktualisiere die Seite.";
  if (/Invalid customer name/i.test(message)) return "Buchung fehlgeschlagen: Der Name muss mindestens 2 Zeichen haben und darf nicht nur aus Zahlen bestehen.";
  if (/Invalid phone/i.test(message)) return "Buchung fehlgeschlagen: Die Telefonnummer ist ungültig.";
  if (/Invalid email/i.test(message)) return "Buchung fehlgeschlagen: Die E-Mail-Adresse ist ungültig.";
  if (/Too many booking attempts/i.test(message)) return "Buchung fehlgeschlagen: Zu viele Versuche. Bitte versuche es in 10 Minuten erneut.";
  if (isConflictError(error)) return `Buchung fehlgeschlagen: ${message}`;
  return `Buchung fehlgeschlagen: ${message}`;
}

function validateCustomerName(value) {
  const name = String(value || "").trim();
  if (!name) return "Bitte gib deinen Namen ein.";
  if (name.length < 2) return "Der Name muss mindestens 2 Zeichen haben.";
  if (/^\d+$/.test(name)) return "Bitte gib einen Namen ein, nicht nur Zahlen.";
  return "";
}

function validateCustomerFields() {
  const fields = [els.customerName, els.customerPhone, els.customerEmail].filter(Boolean);
  fields.forEach((field) => field.setCustomValidity(""));

  const nameError = validateCustomerName(els.customerName?.value);
  if (nameError) {
    els.customerName.setCustomValidity(nameError);
    return els.customerName;
  }

  const phone = els.customerPhone?.value.trim() || "";
  if (!phone) {
    els.customerPhone.setCustomValidity("Bitte gib deine Telefonnummer ein.");
    return els.customerPhone;
  }
  if (!/^\+?[0-9][0-9\s()/.-]{5,}$/.test(phone)) {
    els.customerPhone.setCustomValidity("Bitte gib eine gültige Telefonnummer ein.");
    return els.customerPhone;
  }

  const email = els.customerEmail?.value.trim() || "";
  if (!email) {
    els.customerEmail.setCustomValidity("Bitte gib deine E-Mail-Adresse ein.");
    return els.customerEmail;
  }
  if (!els.customerEmail.checkValidity()) {
    els.customerEmail.setCustomValidity("Bitte gib eine gültige E-Mail-Adresse ein.");
    return els.customerEmail;
  }

  return null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
