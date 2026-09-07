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

const DEFAULT_OPEN_MINUTES = 10 * 60;
const DEFAULT_CLOSE_MINUTES = 19 * 60;
const SLOT_STEP = 30;
const DATE_RANGE_DAYS = 21;
const LOG_RANGE_DAYS = 7;
const STORAGE_KEY = "openslot.barber.mvp.appointments";
const SETTINGS_KEY = "openslot.barber.mvp.day-settings";
const BLOCKS_KEY = "openslot.barber.mvp.blocked-slots";
const SERVICES_KEY = "openslot.barber.mvp.services";
const LEGACY_SERVICE_IDS = new Set(["haircut", "color", "perm"]);
const LEGACY_SERVICE_META = new Map([
  ["haircut", { category: "cut", gender: "unisex" }],
  ["color", { category: "color", gender: "unisex" }],
  ["perm", { category: "shape", gender: "unisex" }],
]);
const WEEKLY_HOURS = [
  { index: 1, key: "salon.day.monday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 2, key: "salon.day.tuesday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 3, key: "salon.day.wednesday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 4, key: "salon.day.thursday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 5, key: "salon.day.friday", openMinutes: 10 * 60, closeMinutes: 18 * 60 },
  { index: 6, key: "salon.day.saturday", openMinutes: 10 * 60, closeMinutes: 17 * 60 },
  { index: 0, key: "salon.day.sunday", openMinutes: null, closeMinutes: null },
];

const state = {
  appointments: [],
  blockedSlots: [],
  upcomingAppointments: [],
  dateOptions: [],
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  isOwner: false,
  logCollapsed: false,
  repository: null,
  servicesCollapsed: false,
  services: DEFAULT_SERVICES,
  salon: null,
};

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
const getServiceName = (service) => service.name;
const confirmMessages = {
  cancelAppointment: "Diesen Termin wirklich stornieren?",
  addService: "Neuen Service hinzufügen?",
  deleteService: "Diesen Service entfernen?",
  saveServices: "Alle Service-Änderungen speichern?",
  blockDay: "Diesen ganzen Tag wirklich blockieren?",
  unblockDay: "Diesen ganzen Tag wieder freigeben?",
};

const els = {
  ownerLoginForm: document.querySelector("#ownerLoginForm"),
  ownerEmail: document.querySelector("#ownerEmail"),
  ownerPassword: document.querySelector("#ownerPassword"),
  ownerAuthMessage: document.querySelector("#ownerAuthMessage"),
  ownerSession: document.querySelector("#ownerSession"),
  ownerEmailLabel: document.querySelector("#ownerEmailLabel"),
  ownerLogoutButton: document.querySelector("#ownerLogoutButton"),
  ownerSideControls: document.querySelector("#ownerSideControls"),
  ownerControls: document.querySelector("#ownerControls"),
  adminDateInput: document.querySelector("#adminDateInput"),
  adminDateStrip: document.querySelector("#adminDateStrip"),
  adminDatePrevButton: document.querySelector("#adminDatePrevButton"),
  adminDateNextButton: document.querySelector("#adminDateNextButton"),
  dayBlockButton: document.querySelector("#dayBlockButton"),
  appointmentCardTitle: document.querySelector("#appointmentCardTitle"),
  upcomingLogTitle: document.querySelector("#upcomingLogTitle"),
  logCollapseButton: document.querySelector("#logCollapseButton"),
  servicesCollapseButton: document.querySelector("#servicesCollapseButton"),
  serviceManager: document.querySelector("#serviceManager"),
  serviceMessage: document.querySelector("#serviceMessage"),
  bookingCount: document.querySelector("#bookingCount"),
  appointmentList: document.querySelector("#appointmentList"),
  upcomingLogCount: document.querySelector("#upcomingLogCount"),
  upcomingLogList: document.querySelector("#upcomingLogList"),
};

function setAdminMessage(message) {
  const target = els.serviceMessage || els.ownerAuthMessage;
  if (target) target.textContent = message;
}

init();

async function init() {
  if (els.adminDateInput) {
    els.adminDateInput.value = toDateInputValue(new Date());
    els.adminDateInput.min = toDateInputValue(new Date());
  }
  state.repository = createRepository();
  bindEvents();
  await initializeAuth();
  await refreshServices();
  await refreshDateOptions();
  await refreshDayData();
  await refreshUpcomingLog();
}

function bindEvents() {
  els.ownerLoginForm?.addEventListener("submit", handleOwnerLogin);
  els.ownerLogoutButton?.addEventListener("click", handleOwnerLogout);
  els.adminDateInput?.addEventListener("change", refreshDayData);
  els.adminDatePrevButton?.addEventListener("click", () => scrollDateStrip(-1));
  els.adminDateNextButton?.addEventListener("click", () => scrollDateStrip(1));
  els.dayBlockButton?.addEventListener("click", handleToggleDayBlock);
  els.logCollapseButton?.addEventListener("click", () => toggleSection("log"));
  els.servicesCollapseButton?.addEventListener("click", () => toggleSection("services"));
  window.addEventListener("openslot:language-change", () => {
    renderServiceManager();
    render();
  });
}

function createRepository() {
  const config = window.OPENSLOT_SUPABASE || {};
  const hasSupabase = Boolean(window.supabase && config.url && config.anonKey);
  if (!hasSupabase) {
    state.isOwner = true;
    return createLocalRepository();
  }
  const client = window.supabase.createClient(config.url, config.anonKey);
  return createSupabaseRepository(client);
}

async function initializeAuth() {
  if (!state.repository.authSupported) {
    renderAuthState({ email: "local-demo" });
    return;
  }
  const user = await state.repository.getCurrentUser();
  state.isOwner = Boolean(user);
  renderAuthState(user);
  state.repository.onAuthChange(async (nextUser) => {
    state.isOwner = Boolean(nextUser);
    renderAuthState(nextUser);
    await refreshServices();
    await refreshDateOptions();
    await refreshDayData();
    await refreshUpcomingLog();
  });
}

async function refreshServices() {
  if (!els.serviceManager) return;
  if (!state.isOwner && state.repository.authSupported) {
    renderServiceManager();
    return;
  }
  try {
    state.services = sortServices(await state.repository.listServices());
  } catch (error) {
    if (els.serviceMessage) els.serviceMessage.textContent = `读取服务失败：${error.message}`;
  }
  renderServiceManager();
}

async function refreshDateOptions() {
  if (!els.adminDateInput || !els.adminDateStrip) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const dates = buildDateRange();
  try {
    const summaries = await Promise.all(dates.map(async (date) => {
      const [appointments, daySettings, blockedSlots] = await Promise.all([
        state.repository.listAppointments(date),
        state.repository.getDaySettings(date),
        state.repository.listBlockedSlots(date),
      ]);
      return {
        date,
        appointmentCount: appointments.filter((appointment) => appointment.status !== "cancelled").length,
        blockedCount: blockedSlots.length,
        isBusinessDay: isBusinessDay(daySettings),
      };
    }));
    state.dateOptions = summaries;
  } catch (error) {
    state.dateOptions = dates.map((date) => ({
      date,
      appointmentCount: 0,
      blockedCount: 0,
      isBusinessDay: isBusinessDay(createDefaultDaySettings(date)),
    }));
  }
  renderDateStrip();
}

async function refreshDayData() {
  if (!els.adminDateInput || !els.appointmentList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  try {
    const date = els.adminDateInput.value;
    const [appointments, daySettings, blockedSlots] = await Promise.all([
      state.repository.listAppointments(date),
      state.repository.getDaySettings(date),
      state.repository.listBlockedSlots(date),
    ]);
    state.appointments = appointments;
    state.daySettings = daySettings;
    state.blockedSlots = blockedSlots;
  } catch (error) {
    if (els.serviceMessage) els.serviceMessage.textContent = `读取后台数据失败：${error.message}`;
  }
  render();
}

async function refreshUpcomingLog() {
  if (!els.upcomingLogList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const startDate = toDateInputValue(new Date());
  const endDate = addDays(startDate, LOG_RANGE_DAYS - 1);
  try {
    state.upcomingAppointments = await state.repository.listAppointmentsRange(startDate, endDate);
  } catch (error) {
    setAdminMessage(`读取预约记录失败：${error.message}`);
    state.upcomingAppointments = [];
  }
  renderUpcomingLog();
}

function render() {
  renderOwnerControls();
  renderDateStrip();
  renderSlotManager();
  renderUpcomingLog();
  renderCollapseState();
}

function renderAuthState(user = null) {
  const keepDiagnosticsServicesVisible = Boolean(els.ownerSideControls?.dataset.diagnosticsServices);
  if (els.ownerSideControls) els.ownerSideControls.hidden = !keepDiagnosticsServicesVisible && !state.isOwner;
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (els.ownerLoginForm) els.ownerLoginForm.hidden = Boolean(user);
  if (els.ownerSession) els.ownerSession.hidden = !user;
  if (els.ownerEmailLabel) els.ownerEmailLabel.textContent = user?.email || "";
  if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = "";
}

function renderOwnerControls() {
  const keepDiagnosticsServicesVisible = Boolean(els.ownerSideControls?.dataset.diagnosticsServices);
  if (els.ownerSideControls) els.ownerSideControls.hidden = !keepDiagnosticsServicesVisible && !state.isOwner;
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (!state.isOwner) return;
}

function renderServiceManager() {
  if (!els.serviceManager) return;
  if (!state.isOwner && state.repository?.authSupported) {
    els.serviceManager.innerHTML = `<div class="empty-state">${t("admin.servicesLoginRequired")}</div>`;
    return;
  }
  const activeServices = state.services.filter((service) => service.isActive);
  els.serviceManager.innerHTML = `
    <form class="service-manager-form">
      <div class="admin-service-list">
        ${activeServices.map((service) => `
          <article class="admin-service-card service-${escapeAttribute(service.category || "care")}" data-service-id="${service.id}">
            <div class="admin-service-title">
              <label>
                <span class="sr-only">${t("common.name")}</span>
                <input name="name" type="text" value="${escapeAttribute(getEditableServiceName(service))}" maxlength="80" required />
              </label>
              <button class="icon-button service-delete-button" type="button" data-delete-service="${service.id}" aria-label="${t("admin.deleteService")}">−</button>
            </div>
            <div class="admin-service-meta">
              <label>
                <span>${t("common.price")}</span>
                <input name="price" type="number" min="0" max="999" step="1" value="${Number(service.price).toFixed(0)}" required />
              </label>
              <label>
                <span>${t("common.minutes")}</span>
                <input name="duration" type="number" min="30" max="240" step="30" value="${service.duration}" required />
              </label>
            </div>
          </article>
        `).join("")}
      </div>
      <div class="service-bulk-actions">
        <button class="ghost-button" type="button" data-add-service>${t("admin.addService")}</button>
        <button class="primary-action compact-action" type="submit">${t("admin.saveServices")}</button>
      </div>
    </form>
  `;
  els.serviceManager.querySelector(".service-manager-form")?.addEventListener("submit", handleSaveServices);
  els.serviceManager.querySelector("[data-add-service]")?.addEventListener("click", handleAddService);
  els.serviceManager.querySelectorAll("[data-delete-service]").forEach((button) => {
    button.addEventListener("click", () => handleDeleteService(button.dataset.deleteService));
  });
  renderCollapseState();
}

function renderDateStrip() {
  if (!els.adminDateStrip || state.dateOptions.length === 0) return;
  const selectedDate = new Date(`${els.adminDateInput.value}T00:00:00`);
  els.adminDateStrip.innerHTML = `
    <div class="date-month-heading">${escapeHtml(formatDateMonthHeading(selectedDate))}</div>
    <div class="date-row">
      ${state.dateOptions.map((option) => {
    const date = new Date(`${option.date}T00:00:00`);
    const label = formatDateButtonLabel(date);
    const isSelected = option.date === els.adminDateInput.value;
    const dateState = getDateStatus(option);
    const weeklyRule = getWeeklyRule(date);
    const isSelectable = weeklyRule.openMinutes !== null;
    const classes = [
      "date-button",
      "admin-date-button",
      isSelected ? "selected" : "",
      option.isBusinessDay ? "" : "closed",
      dateState,
    ].filter(Boolean).join(" ");
    return `
      <button class="${classes}" type="button" data-date="${option.date}" ${isSelectable ? "" : "disabled"}>
        <span class="date-weekday">${escapeHtml(label.weekday)}</span>
        <strong>${escapeHtml(label.day)}</strong>
        <i aria-hidden="true"></i>
      </button>
    `;
  }).join("")}
    </div>
  `;
  els.adminDateStrip.querySelectorAll(".date-button:not(:disabled)").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.date === els.adminDateInput.value) return;
      els.adminDateInput.value = button.dataset.date;
      await refreshDayData();
    });
  });
}

function renderSlotManager() {
  if (!els.appointmentList) return;
  const appointments = [...state.appointments].sort((a, b) => a.startMinutes - b.startMinutes);
  const activeAppointments = appointments.filter((appointment) => appointment.status !== "cancelled");
  const selectedDate = els.adminDateInput?.value || toDateInputValue(new Date());
  if (els.appointmentCardTitle) {
    els.appointmentCardTitle.textContent = `${t("admin.today")} ${formatSelectedDateTitle(selectedDate)} (${activeAppointments.length})`;
  }
  if (els.bookingCount) els.bookingCount.textContent = activeAppointments.length;
  renderDayBlockButton();
  const slots = buildAdminSlots();
  if (slots.length === 0) {
    els.appointmentList.innerHTML = `<div class="empty-state">${state.daySettings.isBlockedDay ? t("admin.dayBlockedEmpty") : t("admin.emptyAppointments")}</div>`;
    return;
  }
  els.appointmentList.innerHTML = `
    <div class="admin-slot-grid">
      ${slots.map((slot) => renderAdminSlot(slot)).join("")}
    </div>
  `;
  els.appointmentList.querySelectorAll("[data-block-slot]").forEach((button) => {
    button.addEventListener("click", () => handleBlockSlot(button.dataset.blockSlot));
  });
  els.appointmentList.querySelectorAll("[data-unblock-slot]").forEach((button) => {
    button.addEventListener("click", () => handleUnblockSlot(button.dataset.unblockSlot));
  });
}

function renderUpcomingLog() {
  if (!els.upcomingLogList) return;
  const appointments = [...state.upcomingAppointments].sort((a, b) => (
    a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes
  ));
  if (els.upcomingLogCount) els.upcomingLogCount.textContent = appointments.length;
  if (els.upcomingLogTitle) {
    els.upcomingLogTitle.textContent = `${t("admin.upcomingLog")} (${appointments.length})`;
  }
  if (appointments.length === 0) {
    els.upcomingLogList.innerHTML = `<div class="empty-state">${t("admin.emptyUpcomingLog")}</div>`;
    renderCollapseState();
    return;
  }
  els.upcomingLogList.innerHTML = `
    <div class="appointment-log-items">
      ${appointments.map((appointment) => renderLogAppointment(appointment)).join("")}
    </div>
  `;
  els.upcomingLogList.querySelectorAll("[data-log-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelAppointmentById(button.dataset.logCancel));
  });
  renderCollapseState();
}

function renderCollapseState() {
  if (els.upcomingLogList && els.logCollapseButton) {
    els.upcomingLogList.hidden = state.logCollapsed;
    els.logCollapseButton.textContent = state.logCollapsed ? "⌄" : "⌃";
    els.logCollapseButton.setAttribute("aria-expanded", String(!state.logCollapsed));
  }
  if (els.serviceManager && els.servicesCollapseButton) {
    els.serviceManager.hidden = state.servicesCollapsed;
    if (els.serviceMessage) els.serviceMessage.hidden = state.servicesCollapsed;
    els.servicesCollapseButton.textContent = state.servicesCollapsed ? "⌄" : "⌃";
    els.servicesCollapseButton.setAttribute("aria-expanded", String(!state.servicesCollapsed));
  }
}

function toggleSection(section) {
  if (section === "log") {
    state.logCollapsed = !state.logCollapsed;
  }
  if (section === "services") {
    state.servicesCollapsed = !state.servicesCollapsed;
  }
  renderCollapseState();
}

function renderLogAppointment(appointment) {
  const service = findService(appointment.serviceId);
  const isCancelled = appointment.status === "cancelled";
  return `
    <article class="appointment-log-item ${isCancelled ? "appointment-cancelled" : ""}">
      <div class="appointment-log-main">
        <span class="appointment-log-date">${escapeHtml(formatLogDate(appointment.date))}</span>
        <strong>${escapeHtml(formatMinutes(appointment.startMinutes))}-${escapeHtml(formatMinutes(appointment.endMinutes))}</strong>
        <span class="service-tag">${escapeHtml(getServiceAbbrev(service))}</span>
        ${isCancelled ? `<span class="status-badge cancelled-badge">${t("lookup.cancelled")}</span>` : ""}
      </div>
      <div class="appointment-log-customer">
        <strong>${escapeHtml(appointment.name || t("admin.unnamedCustomer"))}</strong>
        <span>${escapeHtml(appointment.phone || "")}</span>
        <small>${escapeHtml(appointment.email || "")}</small>
      </div>
      ${isCancelled ? `<span class="mini-action log-action-placeholder" aria-hidden="true"></span>` : `<button class="cancel-button mini-action" type="button" data-log-cancel="${appointment.id}">${t("admin.cancelSlot")}</button>`}
    </article>
  `;
}

function renderAdminSlot(slot) {
  const baseTime = `${formatMinutes(slot.startMinutes)}-${formatMinutes(slot.endMinutes)}`;
  if (slot.appointment) {
    const service = findService(slot.appointment.serviceId);
    const isCancelled = slot.appointment.status === "cancelled";
    return `
      <article class="admin-slot-card booked service-${escapeAttribute(service.category || "care")} ${isCancelled ? "appointment-cancelled" : ""}">
        <div class="admin-slot-head">
          <div class="admin-slot-time">${baseTime}</div>
          <span class="service-tag">${escapeHtml(getServiceAbbrev(service))}</span>
        </div>
        <div class="admin-slot-body">
          <div class="admin-customer-line">
            <strong>${escapeHtml(slot.appointment.name || t("admin.unnamedCustomer"))}</strong>
            <span>${escapeHtml(slot.appointment.phone)}</span>
          </div>
          <small class="admin-customer-email">${escapeHtml(slot.appointment.email || "")}</small>
        </div>
      </article>
    `;
  }
  if (slot.occupiedBy) {
    return `
      <article class="admin-slot-card occupied">
        <div class="admin-slot-head">
          <div class="admin-slot-time">${baseTime}</div>
          <span class="occupied-tag">${t("admin.occupiedSlot")}</span>
        </div>
      </article>
    `;
  }
  if (slot.block) {
    return `
      <article class="admin-slot-card blocked">
        <div class="admin-slot-head">
          <div class="admin-slot-time">${baseTime}</div>
          <span class="blocked-tag">${t("admin.blockedSlot")}</span>
        </div>
        <div class="admin-slot-body">
          <small>${escapeHtml(slot.block.reason || t("admin.manualBlock"))}</small>
        </div>
        <button class="ghost-button mini-action" type="button" data-unblock-slot="${slot.block.id}">${t("admin.unblockSlot")}</button>
      </article>
    `;
  }
  return `
    <article class="admin-slot-card free">
      <div class="admin-slot-head">
        <div class="admin-slot-time">${baseTime}</div>
      </div>
      <button class="ghost-button mini-action" type="button" data-block-slot="${slot.startMinutes}">${t("admin.blockSlot")}</button>
    </article>
  `;
}

async function handleOwnerLogin(event) {
  event.preventDefault();
  try {
    if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = "正在登录...";
    await state.repository.signIn(els.ownerEmail.value.trim(), els.ownerPassword.value);
    els.ownerPassword.value = "";
  } catch (error) {
    if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = `登录失败：${error.message}`;
  }
}

async function handleOwnerLogout() {
  await state.repository.signOut();
}

function handleAddService() {
  if (!window.confirm(confirmMessages.addService)) return;
  const index = state.services.filter((service) => service.id.startsWith("custom_")).length + 1;
  state.services.push({
    id: `custom_${Date.now()}`,
    name: `${t("admin.newService")} ${index}`,
    duration: 30,
    price: 0,
    category: "care",
    gender: "unisex",
    isActive: true,
  });
  renderServiceManager();
}

function handleDeleteService(serviceId) {
  if (!window.confirm(confirmMessages.deleteService)) return;
  state.services = state.services.map((service) => service.id === serviceId ? { ...service, isActive: false } : service);
  renderServiceManager();
}

async function handleSaveServices(event) {
  event.preventDefault();
  if (!window.confirm(confirmMessages.saveServices)) return;
  const form = event.currentTarget;
  const editedServices = state.services.map((service) => {
    const card = form.querySelector(`[data-service-id="${CSS.escape(service.id)}"]`);
    if (!card || !service.isActive) return service;
    return {
      ...service,
      name: card.querySelector('[name="name"]').value.trim(),
      duration: Number(card.querySelector('[name="duration"]').value),
      price: Number(card.querySelector('[name="price"]').value),
      isActive: true,
    };
  });
  for (const service of editedServices) {
    const error = validateService(service);
    if (error) {
      setAdminMessage(error);
      return;
    }
  }
  try {
    await state.repository.saveServices(editedServices);
    setAdminMessage(t("admin.servicesSaved"));
    await refreshServices();
  } catch (saveError) {
    setAdminMessage(`保存服务失败：${saveError.message}`);
  }
}

async function handleToggleDayBlock() {
  const nextBlocked = !state.daySettings.isBlockedDay;
  const message = nextBlocked ? confirmMessages.blockDay : confirmMessages.unblockDay;
  if (!window.confirm(message)) return;
  const nextSettings = {
    ...state.daySettings,
    date: els.adminDateInput.value,
    isBlockedDay: nextBlocked,
  };
  try {
    await state.repository.saveDaySettings(nextSettings);
    state.daySettings = nextSettings;
    setAdminMessage(nextBlocked ? t("admin.dayBlocked") : t("admin.dayUnblocked"));
    await refreshDateOptions();
    await refreshDayData();
  } catch (error) {
    setAdminMessage(`Day block failed: ${error.message}`);
  }
}

async function cancelAppointmentById(appointmentId) {
  if (!window.confirm(confirmMessages.cancelAppointment)) return;
  try {
    await state.repository.cancelAppointment(appointmentId);
    const mailMessage = await state.repository.sendBookingEmail(appointmentId, "cancelled");
    setAdminMessage(mailMessage || "预约已取消。");
    await refreshDateOptions();
    await refreshDayData();
    await refreshUpcomingLog();
  } catch (error) {
    setAdminMessage(`取消失败：${error.message}`);
  }
}

function renderDayBlockButton() {
  if (!els.dayBlockButton) return;
  const weeklyRule = getWeeklyRule(new Date(`${els.adminDateInput.value}T00:00:00`));
  els.dayBlockButton.hidden = weeklyRule.openMinutes === null;
  els.dayBlockButton.textContent = state.daySettings.isBlockedDay ? t("admin.unblockDay") : t("admin.blockDay");
  els.dayBlockButton.classList.toggle("is-blocked", state.daySettings.isBlockedDay);
}

async function handleBlockSlot(startMinutesValue) {
  const startMinutes = Number(startMinutesValue);
  const block = {
    date: els.adminDateInput.value,
    startMinutes,
    endMinutes: startMinutes + SLOT_STEP,
    reason: t("admin.manualBlock"),
  };
  try {
    await state.repository.createBlockedSlot(block);
    setAdminMessage(t("admin.slotBlocked"));
    await refreshDateOptions();
    await refreshDayData();
  } catch (error) {
    setAdminMessage(`Block failed: ${error.message}`);
  }
}

async function handleUnblockSlot(blockId) {
  try {
    await state.repository.deleteBlockedSlot(blockId);
    setAdminMessage(t("admin.slotUnblocked"));
    await refreshDateOptions();
    await refreshDayData();
  } catch (error) {
    setAdminMessage(`Unblock failed: ${error.message}`);
  }
}

function createSupabaseRepository(client) {
  const salonPromise = loadCurrentSalon(client);
  return {
    authSupported: true,
    async getCurrentUser() {
      const { data, error } = await client.auth.getUser();
      if (error) return null;
      return data.user;
    },
    onAuthChange(callback) {
      client.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async listServices() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("services")
        .select("id, name, duration_minutes, price, is_active")
        .eq("salon_id", salon.id)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseService);
    },
    async saveServices(services) {
      const salon = await salonPromise;
      const payload = services.map((service) => ({
        id: service.id,
        salon_id: salon.id,
        name: service.name,
        duration_minutes: service.duration,
        price: service.price,
        is_active: service.isActive,
      }));
      const { error } = await client.from("services").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    async listAppointments(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("appointments")
        .select("id, service_id, appointment_date, start_time, end_time, status, customers(name, phone, email, gender)")
        .eq("salon_id", salon.id)
        .eq("appointment_date", date)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseAppointment);
    },
    async listAppointmentsRange(startDate, endDate) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("appointments")
        .select("id, service_id, appointment_date, start_time, end_time, status, customers(name, phone, email, gender)")
        .eq("salon_id", salon.id)
        .gte("appointment_date", startDate)
        .lte("appointment_date", endDate)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseAppointment);
    },
    async cancelAppointment(id) {
      const salon = await salonPromise;
      const { error } = await client
        .from("appointments")
        .update({ status: "cancelled", cancelled_by: "owner", cancelled_at: new Date().toISOString() })
        .eq("id", id)
        .eq("salon_id", salon.id);
      if (error) throw error;
    },
    async sendBookingEmail(bookingId, eventType) {
      const { error } = await client.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId, event_type: eventType },
      });
      return error ? `预约已取消，但邮件发送失败：${error.message}` : "预约已取消，通知邮件已发送。";
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
      return data ? fromSupabaseDaySettings(data) : createDefaultDaySettings(date);
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
    async createBlockedSlot(block) {
      const salon = await salonPromise;
      const { error } = await client.from("blocked_slots").insert({
        salon_id: salon.id,
        block_date: block.date,
        start_time: `${formatMinutes(block.startMinutes)}:00`,
        end_time: `${formatMinutes(block.endMinutes)}:00`,
        reason: block.reason,
      });
      if (error) throw error;
    },
    async deleteBlockedSlot(blockId) {
      const salon = await salonPromise;
      const { error } = await client.from("blocked_slots").delete().eq("id", blockId).eq("salon_id", salon.id);
      if (error) throw error;
    },
    async saveDaySettings(settings) {
      const salon = await salonPromise;
      const { error } = await client
        .from("shop_day_settings")
        .upsert({
          salon_id: salon.id,
          setting_date: settings.date,
          open_time: `${formatMinutes(settings.openMinutes)}:00`,
          close_time: `${formatMinutes(settings.closeMinutes)}:00`,
          is_blocked_day: settings.isBlockedDay,
        }, { onConflict: "salon_id,setting_date" });
      if (error) throw error;
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
    authSupported: false,
    async getCurrentUser() { return { email: "local-demo" }; },
    onAuthChange() {},
    async signIn() {},
    async signOut() {},
    async listServices() { return loadLocalServices(); },
    async saveServices(services) {
      localStorage.setItem(SERVICES_KEY, JSON.stringify(services));
    },
    async listAppointments(date) { return loadLocalAppointments().filter((appointment) => appointment.date === date); },
    async listAppointmentsRange(startDate, endDate) {
      return loadLocalAppointments().filter((appointment) => appointment.date >= startDate && appointment.date <= endDate);
    },
    async cancelAppointment(id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loadLocalAppointments().map((appointment) => appointment.id === id ? { ...appointment, status: "cancelled", cancelledBy: "owner" } : appointment)));
    },
    async sendBookingEmail() {
      return "预约已取消。本地演示版不会发送邮件。";
    },
    async getDaySettings(date) { return loadLocalSettings()[date] || createDefaultDaySettings(date); },
    async listBlockedSlots(date) { return loadLocalBlocks().filter((block) => block.date === date); },
    async createBlockedSlot(block) {
      const blocks = loadLocalBlocks();
      blocks.push({ ...block, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) });
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
    },
    async deleteBlockedSlot(blockId) {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(loadLocalBlocks().filter((block) => block.id !== blockId)));
    },
    async saveDaySettings(settings) {
      const values = loadLocalSettings();
      values[settings.date] = settings;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
    },
  };
}

function validateService(service) {
  if (service.name.length < 1 || service.name.length > 80) return "服务名称需要 1-80 个字符。";
  if (!Number.isInteger(service.duration) || service.duration < 30 || service.duration > 240 || service.duration % SLOT_STEP !== 0) return "服务时长必须是 30-240 分钟，并按 30 分钟递增。";
  if (!Number.isFinite(service.price) || service.price < 0 || service.price > 999) return "服务价格必须在 0-999 欧元之间。";
  return "";
}

function buildAdminSlots() {
  if (state.daySettings.isBlockedDay) return [];
  const activeAppointments = state.appointments.filter((appointment) => appointment.status !== "cancelled");
  const slots = [];
  for (let start = state.daySettings.openMinutes; start + SLOT_STEP <= state.daySettings.closeMinutes; start += SLOT_STEP) {
    const candidate = { startMinutes: start, endMinutes: start + SLOT_STEP };
    const appointment = activeAppointments.find((item) => item.startMinutes === start);
    const occupiedBy = appointment ? null : findOverlap(candidate, activeAppointments);
    slots.push({
      ...candidate,
      appointment,
      occupiedBy,
      block: appointment || occupiedBy ? null : findOverlap(candidate, state.blockedSlots),
    });
  }
  return slots;
}

function findOverlap(candidate, ranges) {
  return ranges.find((range) => candidate.startMinutes < range.endMinutes && candidate.endMinutes > range.startMinutes);
}

function getDateStatus(option) {
  if (!option.isBusinessDay) return "date-closed";
  if (option.appointmentCount > 0) return "date-booked";
  if (option.blockedCount > 0) return "date-blocked";
  return "date-free";
}

function getEditableServiceName(service) {
  return service.name;
}

function getServiceAbbrev(service) {
  return Array.from(getEditableServiceName(service)).slice(0, 3).join("");
}

function findService(id) {
  return state.services.find((service) => service.id === id) || { id, name: id, duration: 30, price: 0, isActive: false };
}

function sortServices(services) {
  return services.slice().sort((a, b) => (SERVICE_ORDER.get(a.id) ?? 999) - (SERVICE_ORDER.get(b.id) ?? 999));
}

function hasOverlap(candidate, ranges) {
  return ranges.some((range) => range.status !== "cancelled" && candidate.startMinutes < range.endMinutes && candidate.endMinutes > range.startMinutes);
}

function createDefaultDaySettings(date) {
  const weeklyRule = getWeeklyRule(new Date(`${date}T00:00:00`));
  if (weeklyRule.openMinutes === null) {
    return { date, openMinutes: DEFAULT_OPEN_MINUTES, closeMinutes: DEFAULT_CLOSE_MINUTES, isBlockedDay: true };
  }
  return { date, openMinutes: weeklyRule.openMinutes, closeMinutes: weeklyRule.closeMinutes, isBlockedDay: false };
}

function isBusinessDay(settings) {
  const weeklyRule = getWeeklyRule(new Date(`${settings.date}T00:00:00`));
  return weeklyRule.openMinutes !== null && !settings.isBlockedDay && settings.closeMinutes > settings.openMinutes;
}

function buildDateRange() {
  const today = new Date(`${toDateInputValue(new Date())}T00:00:00`);
  return Array.from({ length: DATE_RANGE_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return toDateInputValue(date);
  });
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function getWeeklyRule(date) {
  return WEEKLY_HOURS.find((day) => day.index === date.getDay()) || WEEKLY_HOURS[0];
}

function formatDateButtonLabel(date) {
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
  };
}

function formatDateMonthHeading(date) {
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
}

function formatLogDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return `${dateValue} ${weekday}`;
}

function formatSelectedDateTitle(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(".", "");
  return `am ${dateValue} ${weekday}`;
}

function scrollDateStrip(direction) {
  const dateRow = els.adminDateStrip?.querySelector(".date-row");
  if (!dateRow) return;
  const amount = Math.max(dateRow.clientWidth * 0.78, 240);
  dateRow.scrollBy({ left: direction * amount, behavior: "smooth" });
}

function fromSupabaseService(row) {
  const fallback = DEFAULT_SERVICES.find((service) => service.id === row.id);
  const legacy = LEGACY_SERVICE_META.get(row.id);
  return {
    id: row.id,
    name: row.name,
    duration: row.duration_minutes,
    price: Number(row.price),
    category: fallback?.category || legacy?.category || row.category || "care",
    gender: fallback?.gender || legacy?.gender || row.gender || "unisex",
    isActive: row.is_active,
  };
}

function fromSupabaseAppointment(row) {
  const customer = row.customers || {};
  return {
    id: row.id,
    date: row.appointment_date,
    serviceId: row.service_id,
    gender: customer.gender || "male",
    name: customer.name || "",
    phone: customer.phone || "",
    email: customer.email || "",
    startMinutes: dateToMinutes(row.start_time),
    endMinutes: dateToMinutes(row.end_time),
    status: row.status,
  };
}

function fromSupabaseDaySettings(row) {
  return { date: row.setting_date, openMinutes: parseTime(row.open_time.slice(0, 5)), closeMinutes: parseTime(row.close_time.slice(0, 5)), isBlockedDay: row.is_blocked_day };
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

function loadLocalAppointments() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
function loadLocalSettings() { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
function loadLocalBlocks() { return JSON.parse(localStorage.getItem(BLOCKS_KEY) || "[]"); }
function loadLocalServices() {
  const services = JSON.parse(localStorage.getItem(SERVICES_KEY) || JSON.stringify(DEFAULT_SERVICES));
  if (services.length === 3 && services.every((service) => LEGACY_SERVICE_IDS.has(service.id))) {
    localStorage.setItem(SERVICES_KEY, JSON.stringify(DEFAULT_SERVICES));
    return DEFAULT_SERVICES;
  }
  return services.map((service) => {
    const fallback = DEFAULT_SERVICES.find((item) => item.id === service.id);
    const legacy = LEGACY_SERVICE_META.get(service.id);
    return {
      ...service,
      category: service.category || fallback?.category || legacy?.category || "care",
      gender: service.gender || fallback?.gender || legacy?.gender || "unisex",
    };
  });
}

function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function dateToMinutes(value) {
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    return parseTime(value.slice(0, 5));
  }
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

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
