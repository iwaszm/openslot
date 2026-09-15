const DEFAULT_SERVICES = [
  { id: "damen_haarschnitt", name: "Damen Haarschnitt", shortName: "SchnittD", duration: 60, bookedSlots: [1, 2], price: 30, priceFrom: false, category: "cut", gender: "female", isActive: true },
  { id: "herren_haarschnitt", name: "Herren Haarschnitt", shortName: "SchnittH", duration: 30, bookedSlots: [1], price: 22, priceFrom: false, category: "cut", gender: "male", isActive: true },
  { id: "waschen_foehnen_styling", name: "Waschen, Föhnen, Styling", shortName: "WFS", duration: 30, bookedSlots: [1], price: 15, priceFrom: false, category: "care", gender: "unisex", isActive: true },
  { id: "haarefarben", name: "Haarefarben", shortName: "Farb", duration: 120, bookedSlots: [1, 4], price: 30, priceFrom: true, category: "color", gender: "unisex", isActive: true },
  { id: "dauerwelle", name: "Dauerwelle", shortName: "Dauer", duration: 120, bookedSlots: [1, 4], price: 50, priceFrom: true, category: "shape", gender: "unisex", isActive: true },
  { id: "pflegen", name: "Pflegen", shortName: "Pflegen", duration: 30, bookedSlots: [1], price: 25, priceFrom: false, category: "care", gender: "unisex", isActive: true },
  { id: "straehnen", name: "Strähnen", shortName: "Stra", duration: 120, bookedSlots: [1, 4], price: 40, priceFrom: true, category: "color", gender: "unisex", isActive: true },
  { id: "blondierung", name: "Blondieren", shortName: "Blond", duration: 120, bookedSlots: [1, 4], price: 45, priceFrom: true, category: "color", gender: "unisex", isActive: true },
  { id: "ionen_dauerwelle", name: "Ionen Dauerwelle", shortName: "IDauer", duration: 240, bookedSlots: [1, 2, 4, 5, 7, 8], price: 120, priceFrom: true, category: "shape", gender: "unisex", isActive: true },
  { id: "digitale_dauerwelle", name: "Digitale Dauerwelle", shortName: "DDauer", duration: 240, bookedSlots: [1, 2, 4, 5, 7, 8], price: 120, priceFrom: true, category: "shape", gender: "unisex", isActive: true },
];
const SERVICE_ORDER = new Map(DEFAULT_SERVICES.map((service, index) => [service.id, index]));

const DEFAULT_OPEN_MINUTES = 10 * 60;
const DEFAULT_CLOSE_MINUTES = 19 * 60;
const SLOT_STEP = 30;
const DATE_RANGE_DAYS = 21;
const APPOINTMENT_PAGE_SIZE = 500;
const STORAGE_KEY = "openslot.barber.mvp.appointments";
const SETTINGS_KEY = "openslot.barber.mvp.day-settings";
const BLOCKS_KEY = "openslot.barber.mvp.blocked-slots";
const SERVICES_KEY = "openslot.barber.mvp.services";
const FLEXIBLE_SLOTS_KEY = "openslot.barber.mvp.flexible-staff-slots";
const TIME_BLOCKS_KEY = "openslot.barber.mvp.time-blocks";
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
const LEGACY_LANE_DEFINITIONS = [
  { laneKey: "a", storageKey: "primary", label: "A", sortOrder: 1 },
  { laneKey: "b", storageKey: "overflow", label: "B", sortOrder: 2 },
  { laneKey: "c", storageKey: "flexible", label: "C", sortOrder: 3 },
];

const state = {
  appointments: [],
  blockedSlots: [],
  overflowSlots: [],
  flexibleSlots: [],
  timeBlocks: [],
  upcomingAppointments: [],
  dateOptions: [],
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  isOwner: false,
  accessRole: null,
  logCollapsed: false,
  repository: null,
  services: DEFAULT_SERVICES,
  salon: null,
  laneLayout: createDefaultLaneLayout(),
  useUnifiedScheduleEntries: false,
};

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
const getServiceName = (service) => service.name;
const confirmMessages = {
  cancelAppointment: "Diesen Termin wirklich stornieren?",
  blockDay: "Diesen ganzen Tag wirklich blockieren?",
  unblockDay: "Diesen ganzen Tag wieder freigeben?",
  unblockSlot: "Diesen Block wirklich freigeben?",
};

const els = {
  ownerLoginForm: document.querySelector("#ownerLoginForm"),
  ownerEmail: document.querySelector("#ownerEmail"),
  ownerPassword: document.querySelector("#ownerPassword"),
  ownerTurnstile: document.querySelector("#ownerTurnstile"),
  ownerAuthMessage: document.querySelector("#ownerAuthMessage"),
  ownerSession: document.querySelector("#ownerSession"),
  ownerEmailLabel: document.querySelector("#ownerEmailLabel"),
  ownerLogoutButton: document.querySelector("#ownerLogoutButton"),
  ownerControls: document.querySelector("#ownerControls"),
  adminDateInput: document.querySelector("#adminDateInput"),
  adminDateStrip: document.querySelector("#adminDateStrip"),
  adminDatePrevButton: document.querySelector("#adminDatePrevButton"),
  adminDateNextButton: document.querySelector("#adminDateNextButton"),
  dayBlockButton: document.querySelector("#dayBlockButton"),
  timeBlockToggle: document.querySelector("#timeBlockToggle"),
  timeBlockPanel: document.querySelector("#timeBlockPanel"),
  timeBlockStart: document.querySelector("#timeBlockStart"),
  timeBlockEnd: document.querySelector("#timeBlockEnd"),
  timeBlockAction: document.querySelector("#timeBlockAction"),
  timeBlockHint: document.querySelector("#timeBlockHint"),
  appointmentCardTitle: document.querySelector("#appointmentCardTitle"),
  upcomingLogTitle: document.querySelector("#upcomingLogTitle"),
  logCollapseButton: document.querySelector("#logCollapseButton"),
  adminMessage: document.querySelector("#adminMessage"),
  bookingCount: document.querySelector("#bookingCount"),
  appointmentList: document.querySelector("#appointmentList"),
  upcomingLogCount: document.querySelector("#upcomingLogCount"),
  upcomingLogList: document.querySelector("#upcomingLogList"),
};

function setAdminMessage(message) {
  if (els.adminMessage) els.adminMessage.textContent = message;
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
  await refreshLaneLayout();
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
  els.timeBlockToggle?.addEventListener("click", toggleTimeBlockPanel);
  els.timeBlockStart?.addEventListener("change", renderTimeBlockControls);
  els.timeBlockEnd?.addEventListener("change", renderTimeBlockControls);
  els.timeBlockAction?.addEventListener("click", handleToggleTimeBlock);
  els.logCollapseButton?.addEventListener("click", () => toggleSection("log"));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".service-block-menu")) closeServiceBlockMenus();
    if (!event.target.closest(".time-block-control")) closeTimeBlockPanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.timeBlockPanel?.hidden) {
      closeTimeBlockPanel();
      els.timeBlockToggle?.focus();
    }
  });
  window.addEventListener("openslot:language-change", () => {
    render();
  });
}

function createRepository() {
  const config = window.OPENSLOT_SUPABASE || {};
  const isLocalPreview = new URLSearchParams(window.location.search).has("demo");
  const hasSupabase = !isLocalPreview && Boolean(window.supabase && config.url && config.anonKey);
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
  await applyAuthState(user);
  state.repository.onAuthChange(async (nextUser) => {
    await applyAuthState(nextUser);
    await refreshServices();
    await refreshLaneLayout();
    await refreshDateOptions();
    await refreshDayData();
    await refreshUpcomingLog();
  });
}

async function applyAuthState(user) {
  state.isOwner = false;
  state.accessRole = null;

  if (!user) {
    renderAuthState(null);
    return;
  }

  try {
    const access = await state.repository.getSalonAccess(user.id);
    state.isOwner = access.allowed;
    state.accessRole = access.role;
    renderAuthState(user, access.allowed ? "" : "Keine Berechtigung fur diesen Salon.");
  } catch (error) {
    renderAuthState(user, `Berechtigung konnte nicht gepruft werden: ${error.message}`);
  }
}

async function refreshServices() {
  try {
    state.services = sortServices(await state.repository.listServices());
  } catch (error) {
    setAdminMessage(`读取服务失败：${error.message}`);
  }
}

async function refreshLaneLayout() {
  try {
    const layout = await state.repository.listLaneLayout();
    state.laneLayout = normalizeLaneLayout(layout);
  } catch (_error) {
    state.laneLayout = createDefaultLaneLayout();
  }
}

async function loadManualSchedule(date) {
  const unifiedEntries = await state.repository.listManualScheduleEntries(date);
  if (Array.isArray(unifiedEntries)) {
    return { ...splitManualScheduleEntries(unifiedEntries), isUnified: true };
  }
  const [blockedSlots, overflowSlots, flexibleSlots] = await Promise.all([
    state.repository.listBlockedSlots(date),
    state.repository.listStaffSlots(date, "overflow"),
    state.repository.listStaffSlots(date, "flexible"),
  ]);
  return { blockedSlots, overflowSlots, flexibleSlots, isUnified: false };
}

function splitManualScheduleEntries(entries) {
  const result = { blockedSlots: [], overflowSlots: [], flexibleSlots: [] };
  entries.forEach((entry) => {
    const item = { ...entry, scheduleEntryId: entry.id };
    if (entry.laneKey === "a") {
      result.blockedSlots.push(item);
    } else if (entry.laneKey === "b") {
      result.overflowSlots.push(item);
    } else if (entry.laneKey === "c") {
      result.flexibleSlots.push(item);
    }
  });
  return result;
}

async function refreshDateOptions() {
  if (!els.adminDateInput || !els.adminDateStrip) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const dates = buildDateRange();
  try {
    const summaries = await Promise.all(dates.map(async (date) => {
      const [appointments, daySettings, manualSchedule, timeBlocks] = await Promise.all([
        state.repository.listAppointments(date),
        state.repository.getDaySettings(date),
        loadManualSchedule(date),
        state.repository.listTimeBlocks(date),
      ]);
      return {
        date,
        occupiedSlotCount: countOccupiedSlots(
          appointments,
          manualSchedule.blockedSlots,
          manualSchedule.overflowSlots,
          manualSchedule.flexibleSlots,
          daySettings,
          timeBlocks,
        ),
        totalSlotCount: countDaySlots(daySettings),
        blockedCount: manualSchedule.blockedSlots.filter((item) => !item.serviceId).length,
        isBlockedDay: daySettings.isBlockedDay,
        isBusinessDay: isScheduledBusinessDay(date),
      };
    }));
    state.dateOptions = summaries;
  } catch (error) {
    state.dateOptions = dates.map((date) => ({
      date,
      occupiedSlotCount: 0,
      totalSlotCount: countDaySlots(createDefaultDaySettings(date)),
      blockedCount: 0,
      isBlockedDay: false,
      isBusinessDay: isScheduledBusinessDay(date),
    }));
  }
  renderDateStrip();
}

async function refreshDayData() {
  if (!els.adminDateInput || !els.appointmentList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  try {
    const date = els.adminDateInput.value;
    const [appointments, daySettings, manualSchedule, timeBlocks] = await Promise.all([
      state.repository.listAppointments(date),
      state.repository.getDaySettings(date),
      loadManualSchedule(date),
      state.repository.listTimeBlocks(date),
    ]);
    state.appointments = appointments;
    state.daySettings = daySettings;
    state.blockedSlots = manualSchedule.blockedSlots;
    state.overflowSlots = manualSchedule.overflowSlots;
    state.flexibleSlots = manualSchedule.flexibleSlots;
    state.timeBlocks = timeBlocks;
    state.useUnifiedScheduleEntries = manualSchedule.isUnified;
  } catch (error) {
    setAdminMessage(`读取后台数据失败：${error.message}`);
  }
  render();
}

async function refreshUpcomingLog() {
  if (!els.upcomingLogList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const startDate = toDateInputValue(new Date());
  try {
    state.upcomingAppointments = await state.repository.listAppointmentsFrom(startDate);
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

function renderAuthState(user = null, message = "") {
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (els.ownerLoginForm) els.ownerLoginForm.hidden = Boolean(user);
  if (els.ownerSession) els.ownerSession.hidden = !user;
  if (els.ownerEmailLabel) els.ownerEmailLabel.textContent = user?.email || "";
  if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = message;
}

function renderOwnerControls() {
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (!state.isOwner) return;
}

function renderDateStrip() {
  if (!els.adminDateStrip || state.dateOptions.length === 0) return;
  const previousDateRow = els.adminDateStrip.querySelector(".date-row");
  const previousScrollLeft = previousDateRow ? previousDateRow.scrollLeft : 0;
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
  const dateRow = els.adminDateStrip.querySelector(".date-row");
  if (dateRow && previousScrollLeft > 0) {
    const maxScrollLeft = Math.max(0, dateRow.scrollWidth - dateRow.clientWidth);
    const restoredScrollLeft = Math.min(previousScrollLeft, maxScrollLeft);
    dateRow.style.scrollBehavior = "auto";
    dateRow.scrollLeft = restoredScrollLeft;
    requestAnimationFrame(() => {
      dateRow.style.scrollBehavior = "";
    });
  }
  els.adminDateStrip.querySelectorAll(".date-button:not(:disabled)").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.date === els.adminDateInput.value) return;
      els.adminDateInput.value = button.dataset.date;
      await refreshDayData();
    });
  });
}

function getScheduleLanes(activeAppointments) {
  const allocated = allocateAppointmentLanes(activeAppointments);
  const sources = {
    a: { appointments: allocated.laneA, manual: state.blockedSlots },
    b: { appointments: allocated.laneB, manual: groupStaffOverrides(state.overflowSlots) },
    c: { appointments: allocated.laneC, manual: groupStaffOverrides(state.flexibleSlots) },
  };
  return state.laneLayout.map((lane) => ({
    ...lane,
    appointments: sources[lane.laneKey]?.appointments || [],
    manual: sources[lane.laneKey]?.manual || [],
  }));
}

function renderSlotManager() {
  if (!els.appointmentList) return;
  const appointments = [...state.appointments].sort((a, b) => a.startMinutes - b.startMinutes);
  const activeAppointments = appointments.filter((appointment) => appointment.status !== "cancelled");
  const selectedDate = els.adminDateInput?.value || toDateInputValue(new Date());
  if (els.appointmentCardTitle) {
    const totalSlotCount = countDaySlots(state.daySettings);
    const occupiedSlotCount = countOccupiedSlots(activeAppointments, state.blockedSlots, state.overflowSlots, state.flexibleSlots, state.daySettings, state.timeBlocks);
    els.appointmentCardTitle.textContent = `${t("admin.today")} ${formatSelectedDateTitle(selectedDate, `${occupiedSlotCount}/${totalSlotCount}`)}`;
  }
  if (els.bookingCount) els.bookingCount.textContent = activeAppointments.length;
  renderDayBlockButton();
  renderTimeBlockControls();
  const slots = buildAdminSlots();
  if (slots.length === 0) {
    els.appointmentList.innerHTML = `<div class="empty-state">${state.daySettings.isBlockedDay ? t("admin.dayBlockedEmpty") : t("admin.emptyAppointments")}</div>`;
    return;
  }
  const lanes = getScheduleLanes(activeAppointments);
  els.appointmentList.innerHTML = `
    <div class="staff-schedule" style="--lane-count:${lanes.length}">
      <div class="staff-schedule-head" aria-hidden="true">
        <span></span>
        ${lanes.map((lane) => `<strong>Bereich <small>${escapeHtml(lane.label)}</small></strong>`).join("")}
      </div>
      ${renderOutlookSchedule(slots, lanes)}
    </div>
  `;
  els.appointmentList.querySelectorAll("[data-lane-action]").forEach((button) => {
    button.addEventListener("click", () => handleLaneAction(
      button.dataset.lane,
      button.dataset.start,
      button.dataset.laneAction,
      button.dataset.serviceId || null,
    ));
  });
  els.appointmentList.querySelectorAll(".service-block-menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) closeServiceBlockMenus(menu);
    });
  });
}

function renderOutlookSchedule(slots, lanes) {
  const rowCount = slots.length;
  const gridRows = slots.map((slot, rowIndex) => {
    const row = rowIndex + 1;
    const isHour = slot.startMinutes % 60 === 0;
    const laneCells = lanes.map((lane, laneIndex) => {
      const isTimeBlocked = state.timeBlocks.some((block) => (
        slot.startMinutes >= block.startMinutes && slot.startMinutes < block.endMinutes
      ));
      const isCovered = isTimeBlocked || [...lane.appointments, ...lane.manual].some((item) => (
        slot.startMinutes >= item.startMinutes && slot.startMinutes < item.endMinutes
      ));
      return `
        <div class="calendar-lane-cell lane-column-${laneIndex + 1} ${laneIndex === lanes.length - 1 ? "is-last-lane" : ""} ${isCovered ? "is-covered" : "is-open"}" style="grid-column:${laneIndex + 2};grid-row:${row}">
          ${isCovered ? "" : renderSlotMenu({ startMinutes: slot.startMinutes, lane: lane.storageKey })}
        </div>
      `;
    }).join("");
    return `
      <div class="calendar-grid-line ${isHour ? "hour-line" : "half-hour-line"}" style="grid-row:${row}" aria-hidden="true"></div>
      <div class="staff-time-marker ${isHour ? "hour-marker" : "half-hour-marker"}" style="grid-row:${row}" aria-hidden="true">
        ${isHour ? `<span>${escapeHtml(formatMinutes(slot.startMinutes))}</span>` : ""}
      </div>
      ${laneCells}
    `;
  }).join("");
  const eventBlocks = lanes.map((lane, laneIndex) => [
    ...lane.appointments.map((item) => renderCalendarEvent(item, lane.storageKey, laneIndex, "online", rowCount)),
    ...lane.manual.map((item) => renderCalendarEvent(item, lane.storageKey, laneIndex, item.serviceId ? "manual" : "blocked", rowCount)),
  ].join("")).join("");
  const timeBlockEvents = state.timeBlocks.map((block) => renderCalendarTimeBlock(block, rowCount)).join("");
  return `
    <div class="staff-schedule-body outlook-calendar" style="--calendar-rows:${rowCount}">
      ${gridRows}
      <div class="calendar-grid-end" aria-hidden="true"></div>
      ${eventBlocks}
      ${timeBlockEvents}
    </div>
  `;
}

function renderCalendarTimeBlock(block, rowCount) {
  const openMinutes = state.daySettings.openMinutes;
  const startRow = Math.max(1, Math.floor((block.startMinutes - openMinutes) / SLOT_STEP) + 1);
  const visibleEnd = Math.min(block.endMinutes, state.daySettings.closeMinutes);
  const rowSpan = Math.max(1, Math.min(rowCount - startRow + 1, Math.ceil((visibleEnd - block.startMinutes) / SLOT_STEP)));
  return `
    <article
      class="calendar-time-block"
      style="grid-column:2 / -1;grid-row:${startRow} / span ${rowSpan}"
      aria-label="${escapeAttribute(`Blockiert ${formatMinutes(block.startMinutes)}-${formatMinutes(block.endMinutes)}`)}"
    >
      <strong>Blockiert</strong>
      <span>${escapeHtml(formatMinutes(block.startMinutes))}-${escapeHtml(formatMinutes(block.endMinutes))}</span>
    </article>
  `;
}

function renderCalendarEvent(item, lane, laneIndex, kind, rowCount) {
  const openMinutes = state.daySettings.openMinutes;
  const startRow = Math.max(1, Math.floor((item.startMinutes - openMinutes) / SLOT_STEP) + 1);
  const visibleEnd = Math.min(item.endMinutes, state.daySettings.closeMinutes);
  const rowSpan = Math.max(1, Math.min(rowCount - startRow + 1, Math.ceil((visibleEnd - item.startMinutes) / SLOT_STEP)));
  const service = item.serviceId ? findService(item.serviceId) : null;
  const customerName = kind === "online" ? (item.name || t("admin.unnamedCustomer")) : "";
  const label = service ? getServiceAbbrev(service) : t("admin.blockedSlot");
  const color = service?.slotColor || "#c98f86";
  const menu = kind === "online" ? "" : renderSlotMenu({ startMinutes: item.startMinutes, lane, item });
  return `
    <article
      class="calendar-event ${kind} ${rowSpan === 1 ? "duration-single" : ""} ${service ? "service-colored" : ""}"
      data-slot-start="${item.startMinutes}"
      style="grid-column:${laneIndex + 2};grid-row:${startRow} / span ${rowSpan};--slot-color:${escapeAttribute(color)}"
      aria-label="${escapeAttribute(`${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)} ${label}${customerName ? ` ${customerName}` : ""}`)}"
    >
      <div class="calendar-event-copy">
        <strong>${escapeHtml(label)}</strong>
        ${customerName ? `<span class="${getCustomerNameSizeClass(customerName)}">${escapeHtml(customerName)}</span>` : ""}
      </div>
      ${menu}
    </article>
  `;
}

function renderStaffScheduleRow(slot) {
  const isHour = slot.startMinutes % 60 === 0;
  return `
    <div class="staff-time-row ${isHour ? "hour-row" : "half-hour-row"}">
      <div class="staff-time-marker" aria-hidden="true">${isHour ? `<span>${escapeHtml(formatMinutes(slot.startMinutes))}</span>` : ""}</div>
      ${renderAdminSlot(slot)}
      ${renderOverflowSlot(slot)}
      ${renderFlexibleSlot(slot)}
    </div>
  `;
}

function closeServiceBlockMenus(except = null) {
  document.querySelectorAll(".service-block-menu[open]").forEach((menu) => {
    if (menu !== except) menu.removeAttribute("open");
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
}

function toggleSection(section) {
  if (section === "log") {
    state.logCollapsed = !state.logCollapsed;
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
  if (slot.laneAAppointment) return renderAppointmentLaneSlot(slot.laneAAppointment, slot.startMinutes, "lane-a");
  if (slot.laneABlock) return renderManualLaneSlot(slot.laneABlock, slot.startMinutes, "primary");
  return renderEmptyLaneSlot(slot.startMinutes, "primary");
}

function renderOverflowSlot(slot) {
  if (slot.laneBAppointment) return renderAppointmentLaneSlot(slot.laneBAppointment, slot.startMinutes, "lane-b");
  const override = findStaffCoverageAt(state.overflowSlots, slot.startMinutes);
  if (override) return renderManualLaneSlot(override, slot.startMinutes, "overflow");
  return renderEmptyLaneSlot(slot.startMinutes, "overflow");
}

function renderAppointmentLaneSlot(appointment, startMinutes, laneClass) {
  const service = findService(appointment.serviceId);
  const edgeClasses = getCoverageEdgeClasses(appointment, startMinutes);
  const customerName = appointment.name || t("admin.unnamedCustomer");
  const showContent = edgeClasses.includes("booking-first") || edgeClasses.includes("booking-single");
  return `
    <article class="admin-slot-card booked service-colored booking-segment ${edgeClasses} ${laneClass}" data-slot-start="${startMinutes}" style="--slot-color:${escapeAttribute(service.slotColor || "#F48FB1")}">
      ${showContent ? `
        <div class="admin-slot-head online-slot-head">
          <span class="service-tag">${escapeHtml(getServiceAbbrev(service))}</span>
          <strong class="slot-customer-name ${getCustomerNameSizeClass(customerName)}">${escapeHtml(customerName)}</strong>
        </div>
      ` : ""}
    </article>
  `;
}

function renderFlexibleSlot(slot) {
  if (slot.laneCAppointment) return renderAppointmentLaneSlot(slot.laneCAppointment, slot.startMinutes, "lane-c");
  const override = findStaffCoverageAt(state.flexibleSlots, slot.startMinutes);
  if (override) return renderManualLaneSlot(override, slot.startMinutes, "flexible");
  return renderEmptyLaneSlot(slot.startMinutes, "flexible");
}

function renderEmptyLaneSlot(startMinutes, lane) {
  return `<article class="admin-slot-card free lane-${lane}" data-slot-start="${startMinutes}">${renderSlotMenu({ startMinutes, lane })}</article>`;
}

function renderManualLaneSlot(item, startMinutes, lane) {
  const service = item.serviceId ? findService(item.serviceId) : null;
  const edgeClasses = service ? getManualEdgeClasses(item, startMinutes, lane) : "booking-single";
  const showContent = !service || edgeClasses.includes("booking-first") || edgeClasses.includes("booking-single");
  const classes = service ? "service-colored booking-segment" : "blocked";
  const style = service ? ` style="--slot-color:${escapeAttribute(service.slotColor || "#F48FB1")}"` : "";
  return `
    <article class="admin-slot-card ${classes} ${edgeClasses} lane-${lane}" data-slot-start="${startMinutes}"${style}>
      ${showContent ? `<span class="${service ? "service-tag" : "blocked-tag"}">${service ? escapeHtml(getServiceAbbrev(service)) : t("admin.blockedSlot")}</span>` : ""}
      ${showContent ? renderSlotMenu({ startMinutes, lane, item }) : ""}
    </article>
  `;
}

function renderSlotMenu({ startMinutes, lane, item = null }) {
  const clearDisabled = item ? "" : "disabled";
  const serviceOptions = state.services
    .filter((service) => service.isActive)
    .map((service) => {
      const disabled = !canPlaceManualService(service, startMinutes, lane, item);
      return `<button type="button" role="menuitem" data-lane-action="service" data-lane="${lane}" data-start="${startMinutes}" data-service-id="${escapeAttribute(service.id)}" ${disabled ? "disabled" : ""}>${escapeHtml(getServiceAbbrev(service))}</button>`;
    }).join("");
  return `
    <details class="service-block-menu lane-menu">
      <summary aria-label="${escapeAttribute(t("admin.selectService"))}" title="${escapeAttribute(t("admin.selectService"))}">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>
      </summary>
      <div class="service-block-options" role="menu">
        <button type="button" role="menuitem" class="clear-lane-option" data-lane-action="clear" data-lane="${lane}" data-start="${startMinutes}" ${clearDisabled}>Löschen</button>
        ${serviceOptions}
      </div>
    </details>
  `;
}

async function handleLaneAction(lane, startMinutesValue, action, serviceId = null) {
  const startMinutes = Number(startMinutesValue);
  const existing = findManualItemAt(lane, startMinutes);
  try {
    if (action === "clear") {
      if (!existing) return;
      const confirmed = await window.OpenSlotConfirm.ask({
        title: "Eintrag löschen",
        message: "Diesen manuellen Eintrag wirklich löschen?",
        confirmLabel: "Löschen",
        tone: "danger",
      });
      if (!confirmed) return;
      await clearManualItem(lane, existing);
    } else {
      if (action === "service") {
        const service = findService(serviceId);
        if (!canPlaceManualService(service, startMinutes, lane, existing)) throw new Error("Der Service kollidiert mit einem bestehenden Termin.");
      }
      if (action === "service") {
        const service = findService(serviceId);
        if (existing && !existing.scheduleEntryId) await clearManualItem(lane, existing);
        await saveManualService(lane, startMinutes, service, existing);
      }
    }
    await refreshDateOptions();
    await refreshDayData();
  } catch (error) {
    setAdminMessage(`Eintrag konnte nicht aktualisiert werden: ${error.message}`);
  }
}

async function clearManualItem(lane, item) {
  if (item.scheduleEntryId) {
    await state.repository.deleteManualScheduleEntry(item.scheduleEntryId);
    return;
  }
  if (lane === "primary") {
    await state.repository.deleteBlockedSlot(item.id);
    return;
  }
  const staffKey = lane;
  const slots = getStaffSlots(lane);
  const groupStart = item.serviceStartMinutes ?? item.startMinutes;
  const group = item.serviceId
    ? slots.filter((slot) => slot.serviceId === item.serviceId && (slot.serviceStartMinutes ?? slot.startMinutes) === groupStart)
    : [item];
  await Promise.all(group.map((slot) => state.repository.deleteStaffSlot(els.adminDateInput.value, staffKey, slot.startMinutes)));
}

async function saveManualService(lane, startMinutes, service, existing = null) {
  if (state.useUnifiedScheduleEntries) {
    const laneConfig = state.laneLayout.find((item) => item.storageKey === lane);
    if (!laneConfig?.staffLaneId) throw new Error("Für diesen Bereich fehlt eine aktive Lane-Konfiguration.");
    await state.repository.createManualScheduleEntry({
      date: els.adminDateInput.value,
      startMinutes,
      serviceId: service.id,
      staffLaneId: laneConfig.staffLaneId,
      replaceEntryId: existing?.scheduleEntryId || null,
    });
    return;
  }
  if (lane === "primary") {
    await state.repository.createBlockedSlot({
      date: els.adminDateInput.value,
      startMinutes,
      endMinutes: startMinutes + service.duration,
      occupiedMinutes: getServiceOccupiedMinutes(service, startMinutes),
      serviceId: service.id,
      serviceStartMinutes: startMinutes,
      reason: "",
    });
    return;
  }
  await Promise.all(getServiceCoveredMinutes(service, startMinutes).map((coveredStart) => state.repository.saveStaffSlot({
    date: els.adminDateInput.value,
    startMinutes: coveredStart,
    serviceId: service.id,
    serviceStartMinutes: startMinutes,
    isOpen: true,
  }, lane)));
}

function getStaffSlots(lane) {
  return lane === "overflow" ? state.overflowSlots : state.flexibleSlots;
}

function findManualItemAt(lane, startMinutes) {
  if (lane === "primary") return findCoverageAt(state.blockedSlots, startMinutes);
  return findStaffCoverageAt(getStaffSlots(lane), startMinutes);
}

function findStaffCoverageAt(staffSlots, startMinutes) {
  return staffSlots.find((item) => item.startMinutes === startMinutes && (item.serviceId || item.isOpen === false)) || null;
}

function getManualEdgeClasses(item, startMinutes, lane) {
  if (lane === "primary") return getCoverageEdgeClasses(item, startMinutes);
  const groupStart = item.serviceStartMinutes ?? item.startMinutes;
  const service = findService(item.serviceId);
  return getCoverageEdgeClasses({ startMinutes: groupStart, endMinutes: groupStart + service.duration }, startMinutes);
}

function canPlaceManualService(service, startMinutes, lane, ignoredItem = null) {
  const candidate = {
    startMinutes,
    endMinutes: startMinutes + service.duration,
    occupiedMinutes: getServiceOccupiedMinutes(service, startMinutes),
  };
  const ignoredGroupStart = ignoredItem ? (ignoredItem.serviceStartMinutes ?? ignoredItem.startMinutes) : null;
  const laneItems = getLaneManualGroups(lane).filter((item) => (
    ignoredGroupStart === null || (item.serviceStartMinutes ?? item.startMinutes) !== ignoredGroupStart
  ));
  return !hasTimeRangeOverlap(candidate, getLaneAppointments(lane))
    && !hasTimeRangeOverlap(candidate, laneItems);
}

async function handleOwnerLogin(event) {
  event.preventDefault();
  try {
    const captchaToken = getOwnerTurnstileToken();
    if (els.ownerTurnstile && !captchaToken) {
      throw new Error("Bitte schliesse die Sicherheitspruefung ab.");
    }
    if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = "正在登录...";
    await state.repository.signIn(els.ownerEmail.value.trim(), els.ownerPassword.value, captchaToken);
    els.ownerPassword.value = "";
  } catch (error) {
    if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = `登录失败：${error.message}`;
    resetOwnerTurnstile();
  }
}

function getOwnerTurnstileToken() {
  if (!els.ownerTurnstile) return "";
  const formToken = els.ownerLoginForm?.querySelector('input[name="cf-turnstile-response"]')?.value || "";
  return formToken || window.turnstile?.getResponse?.(els.ownerTurnstile) || window.turnstile?.getResponse?.() || "";
}

function resetOwnerTurnstile() {
  if (els.ownerTurnstile) window.turnstile?.reset?.(els.ownerTurnstile);
}

async function handleOwnerLogout() {
  await state.repository.signOut();
}

async function handleToggleDayBlock() {
  const nextBlocked = !state.daySettings.isBlockedDay;
  const message = nextBlocked ? confirmMessages.blockDay : confirmMessages.unblockDay;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: nextBlocked ? "Tag blockieren" : "Tag freigeben",
    message,
    confirmLabel: nextBlocked ? "Tag blockieren" : "Freigeben",
    tone: nextBlocked ? "danger" : "neutral",
  });
  if (!confirmed) return;
  els.dayBlockButton.disabled = true;
  try {
    await state.repository.setDayBlocked({
      ...state.daySettings,
      date: els.adminDateInput.value,
      isBlockedDay: nextBlocked,
    });
    await refreshDateOptions();
    await refreshDayData();
    await window.OpenSlotConfirm.notice({
      title: nextBlocked ? "Tag blockiert" : "Tag freigegeben",
      message: nextBlocked
        ? "Der Tag wurde erfolgreich für neue Buchungen gesperrt."
        : "Der Tag ist wieder für Buchungen freigegeben.",
      tone: "success",
    });
  } catch (error) {
    await showAvailabilityError(error, "Der Tag konnte nicht blockiert werden.");
  } finally {
    els.dayBlockButton.disabled = false;
  }
}

async function cancelAppointmentById(appointmentId) {
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Termin stornieren",
    message: confirmMessages.cancelAppointment,
    confirmLabel: "Stornieren",
    tone: "danger",
  });
  if (!confirmed) return;
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
  const label = state.daySettings.isBlockedDay ? t("admin.unblockDay") : t("admin.blockDay");
  els.dayBlockButton.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 2v3M16 2v3M3 9h18"/><rect x="3" y="4" width="18" height="17" rx="2"/><path d="${state.daySettings.isBlockedDay ? "m9 15 2 2 4-5" : "m9 13 6 6M15 13l-6 6"}"/></svg>
    <span>${escapeHtml(label)}</span>
  `;
  els.dayBlockButton.setAttribute("aria-label", label);
  els.dayBlockButton.classList.toggle("is-blocked", state.daySettings.isBlockedDay);
}

function toggleTimeBlockPanel() {
  if (!els.timeBlockPanel || !els.timeBlockToggle) return;
  const willOpen = els.timeBlockPanel.hidden;
  els.timeBlockPanel.hidden = !willOpen;
  els.timeBlockToggle.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) requestAnimationFrame(() => els.timeBlockStart?.focus());
}

function closeTimeBlockPanel() {
  if (!els.timeBlockPanel || !els.timeBlockToggle || els.timeBlockPanel.hidden) return;
  els.timeBlockPanel.hidden = true;
  els.timeBlockToggle.setAttribute("aria-expanded", "false");
}

function renderTimeBlockControls() {
  if (!els.timeBlockStart || !els.timeBlockEnd || !els.timeBlockAction || !els.timeBlockToggle) return;
  const { openMinutes, closeMinutes, isBlockedDay } = state.daySettings;
  const signature = `${els.adminDateInput?.value}:${openMinutes}:${closeMinutes}:${state.timeBlocks.map((block) => `${block.id}:${block.startMinutes}-${block.endMinutes}`).join(",")}`;
  if (els.timeBlockPanel?.dataset.signature !== signature) {
    const currentStart = els.timeBlockStart.value ? Number(els.timeBlockStart.value) : Number.NaN;
    const currentEnd = els.timeBlockEnd.value ? Number(els.timeBlockEnd.value) : Number.NaN;
    els.timeBlockStart.innerHTML = buildTimeOptions(openMinutes, closeMinutes - SLOT_STEP);
    els.timeBlockEnd.innerHTML = buildTimeOptions(openMinutes + SLOT_STEP, closeMinutes);
    const preferredBlock = state.timeBlocks[0];
    const startValue = preferredBlock?.startMinutes ?? (Number.isFinite(currentStart) ? currentStart : openMinutes);
    const endValue = preferredBlock?.endMinutes ?? (Number.isFinite(currentEnd) ? currentEnd : Math.min(closeMinutes, startValue + 60));
    els.timeBlockStart.value = String(Math.max(openMinutes, Math.min(startValue, closeMinutes - SLOT_STEP)));
    els.timeBlockEnd.value = String(Math.max(openMinutes + SLOT_STEP, Math.min(endValue, closeMinutes)));
    if (els.timeBlockPanel) els.timeBlockPanel.dataset.signature = signature;
  }

  const startMinutes = Number(els.timeBlockStart.value);
  const endMinutes = Number(els.timeBlockEnd.value);
  [...els.timeBlockEnd.options].forEach((option) => {
    option.disabled = Number(option.value) <= startMinutes;
  });
  if (endMinutes <= startMinutes) {
    els.timeBlockEnd.value = String(Math.min(closeMinutes, startMinutes + SLOT_STEP));
  }

  const selectedStart = Number(els.timeBlockStart.value);
  const selectedEnd = Number(els.timeBlockEnd.value);
  const exactBlock = findExactTimeBlock(selectedStart, selectedEnd);
  const overlapsAnotherBlock = !exactBlock && state.timeBlocks.some((block) => (
    selectedStart < block.endMinutes && selectedEnd > block.startMinutes
  ));
  const label = exactBlock ? "Uhrzeit freigeben" : "Uhrzeit blockieren";
  const toggleLabel = els.timeBlockToggle.querySelector("span");
  if (toggleLabel) toggleLabel.textContent = label;
  els.timeBlockAction.textContent = label;
  els.timeBlockAction.classList.toggle("is-unblock", Boolean(exactBlock));
  els.timeBlockToggle.classList.toggle("is-blocked", Boolean(exactBlock));
  els.timeBlockToggle.disabled = isBlockedDay;
  els.timeBlockAction.disabled = isBlockedDay || overlapsAnotherBlock || selectedEnd <= selectedStart;
  if (els.timeBlockHint) {
    els.timeBlockHint.textContent = isBlockedDay
      ? "Der gesamte Tag ist bereits blockiert."
      : overlapsAnotherBlock
      ? "Die Auswahl überschneidet eine bestehende Sperre. Wähle deren genaue Zeit, um sie freizugeben."
        : "";
  }
}

function buildTimeOptions(startMinutes, endMinutes) {
  const options = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += SLOT_STEP) {
    options.push(`<option value="${minutes}">${escapeHtml(formatMinutes(minutes))}</option>`);
  }
  return options.join("");
}

function findExactTimeBlock(startMinutes, endMinutes) {
  return state.timeBlocks.find((block) => block.startMinutes === startMinutes && block.endMinutes === endMinutes) || null;
}

async function handleToggleTimeBlock() {
  const startMinutes = Number(els.timeBlockStart?.value);
  const endMinutes = Number(els.timeBlockEnd?.value);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return;
  const existing = findExactTimeBlock(startMinutes, endMinutes);
  const confirmed = await window.OpenSlotConfirm.ask({
    title: existing ? "Uhrzeit freigeben" : "Uhrzeit blockieren",
    message: existing
      ? `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} wirklich wieder freigeben?`
      : `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} für neue Buchungen blockieren?`,
    confirmLabel: existing ? "Freigeben" : "Blockieren",
    tone: existing ? "neutral" : "danger",
  });
  if (!confirmed) return;

  els.timeBlockAction.disabled = true;
  try {
    if (existing) {
      await state.repository.deleteTimeBlock(existing.id);
    } else {
      await state.repository.createTimeBlock({
        date: els.adminDateInput.value,
        startMinutes,
        endMinutes,
      });
    }
    await refreshDateOptions();
    await refreshDayData();
    await window.OpenSlotConfirm.notice({
      title: existing ? "Uhrzeit freigegeben" : "Uhrzeit blockiert",
      message: existing
        ? `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} ist wieder buchbar.`
        : `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} wurde erfolgreich blockiert.`,
      tone: "success",
    });
  } catch (error) {
    await showAvailabilityError(error, "Die Uhrzeit konnte nicht blockiert werden.");
  } finally {
    renderTimeBlockControls();
  }
}

async function showAvailabilityError(error, fallbackMessage) {
  const message = String(error?.message || "");
  const occupied = message.includes("OCCUPIED_SLOTS_PRESENT");
  await window.OpenSlotConfirm.notice({
    title: occupied ? "Blockierung nicht möglich" : "Änderung nicht möglich",
    message: occupied
      ? "In diesem Zeitraum liegen bereits belegte Arbeitszeiten. Verschiebe oder storniere die betroffenen Termine und versuche es erneut."
      : fallbackMessage,
    tone: "error",
  });
}

async function handleBlockSlot(startMinutesValue, serviceId = null) {
  const startMinutes = Number(startMinutesValue);
  const service = serviceId ? findService(serviceId) : null;
  const block = {
    date: els.adminDateInput.value,
    startMinutes,
    endMinutes: startMinutes + (service?.duration || SLOT_STEP),
    occupiedMinutes: service ? getServiceOccupiedMinutes(service, startMinutes) : [startMinutes],
    serviceId: service?.id || null,
    serviceStartMinutes: startMinutes,
    reason: "",
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
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Block freigeben",
    message: confirmMessages.unblockSlot,
    confirmLabel: "Freigeben",
    tone: "neutral",
  });
  if (!confirmed) return;
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
    async signIn(email, password, captchaToken) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
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
        .select("id, name, short_name, duration_minutes, booked_slots, price, price_from, is_active, category, slot_color")
        .eq("salon_id", salon.id)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseService);
    },
    async listLaneLayout() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_lanes")
        .select("id, lane_key, label, sort_order, salon_staff!inner(staff_key, name, sort_order, is_active)")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .eq("salon_staff.is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => ({
        staffLaneId: row.id,
        laneKey: row.lane_key,
        label: row.label,
        sortOrder: row.sort_order,
        staffKey: row.salon_staff?.staff_key,
        staffName: row.salon_staff?.name,
        staffSortOrder: row.salon_staff?.sort_order,
      })).sort((left, right) => (
        Number(left.staffSortOrder || 0) - Number(right.staffSortOrder || 0)
        || Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      ));
    },
    async listManualScheduleEntries(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("schedule_entries")
        .select("id, service_id, entry_source, schedule_date, covered_start, covered_end, occupied_slots, staff_lanes!inner(lane_key)")
        .eq("salon_id", salon.id)
        .eq("schedule_date", date)
        .eq("status", "active")
        .neq("entry_source", "online")
        .order("covered_start", { ascending: true });
      if (error && isMissingUnifiedSchedule(error)) return null;
      if (error) throw error;
      return (data || []).map(fromSupabaseScheduleEntry);
    },
    async createManualScheduleEntry(entry) {
      const salon = await salonPromise;
      const { error } = await client.rpc("create_admin_schedule_entry", {
        p_salon_id: salon.id,
        p_staff_lane_id: entry.staffLaneId,
        p_schedule_date: entry.date,
        p_start_time: `${formatMinutes(entry.startMinutes)}:00`,
        p_service_id: entry.serviceId || null,
        p_replace_entry_id: entry.replaceEntryId || null,
      });
      if (error) throw error;
    },
    async deleteManualScheduleEntry(entryId) {
      const { error } = await client.rpc("cancel_admin_schedule_entry", { p_entry_id: entryId });
      if (error) throw error;
    },
    async listAppointments(date) {
      const salon = await salonPromise;
      let { data, error } = await client
        .from("appointments")
        .select("id, service_id, appointment_date, start_time, end_time, occupied_slots, lane_key, status, customers(name, phone, email, gender)")
        .eq("salon_id", salon.id)
        .eq("appointment_date", date)
        .order("start_time", { ascending: true });
      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("appointments")
          .select("id, service_id, appointment_date, start_time, end_time, occupied_slots, status, customers(name, phone, email, gender)")
          .eq("salon_id", salon.id)
          .eq("appointment_date", date)
          .order("start_time", { ascending: true }));
      }
      if (error) throw error;
      return (data || []).map(fromSupabaseAppointment);
    },
    async listAppointmentsFrom(startDate) {
      const salon = await salonPromise;
      const rows = [];
      let offset = 0;
      let includeLane = true;

      while (true) {
        const columns = includeLane
          ? "id, service_id, appointment_date, start_time, end_time, occupied_slots, lane_key, status, customers(name, phone, email, gender)"
          : "id, service_id, appointment_date, start_time, end_time, occupied_slots, status, customers(name, phone, email, gender)";
        const { data, error } = await client
          .from("appointments")
          .select(columns)
          .eq("salon_id", salon.id)
          .gte("appointment_date", startDate)
          .order("appointment_date", { ascending: true })
          .order("start_time", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + APPOINTMENT_PAGE_SIZE - 1);

        if (error?.code === "42703" && includeLane && offset === 0) {
          includeLane = false;
          continue;
        }
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < APPOINTMENT_PAGE_SIZE) break;
        offset += APPOINTMENT_PAGE_SIZE;
      }

      return rows.map(fromSupabaseAppointment);
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
    async getSalonAccess(userId) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("salon_members")
        .select("salon_id, role")
        .eq("user_id", userId);
      if (error) throw error;
      const memberships = data || [];
      const superAdmin = memberships.find((membership) => membership.role === "super_admin");
      if (superAdmin) return { allowed: true, role: "super_admin" };
      const salonMembership = memberships.find((membership) => membership.salon_id === salon.id);
      return {
        allowed: Boolean(salonMembership),
        role: salonMembership?.role || null,
      };
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
    async listTimeBlocks(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("admin_time_blocks")
        .select("id, block_date, start_time, end_time")
        .eq("salon_id", salon.id)
        .eq("block_date", date)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseTimeBlock);
    },
    async createTimeBlock(block) {
      const salon = await salonPromise;
      const { error } = await client.rpc("create_admin_time_block", {
        p_salon_id: salon.id,
        p_block_date: block.date,
        p_start_time: `${formatMinutes(block.startMinutes)}:00`,
        p_end_time: `${formatMinutes(block.endMinutes)}:00`,
      });
      if (error) throw error;
    },
    async deleteTimeBlock(blockId) {
      const { error } = await client.rpc("delete_admin_time_block", { p_block_id: blockId });
      if (error) throw error;
    },
    async listBlockedSlots(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("blocked_slots")
        .select("id, block_date, start_time, end_time, reason, service_id, service_start_time, occupied_slots")
        .eq("salon_id", salon.id)
        .eq("block_date", date)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseBlockedSlot);
    },
    async listStaffSlots(date, staffKey) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_slot_overrides")
        .select("slot_date, start_time, service_id, service_start_time, is_open")
        .eq("salon_id", salon.id)
        .eq("staff_key", staffKey)
        .eq("slot_date", date)
        .order("start_time", { ascending: true });
      if (error) return loadLocalStaffSlots(date, staffKey);
      return (data || []).map((row) => ({
        date: row.slot_date,
        startMinutes: parseTime(row.start_time.slice(0, 5)),
        serviceId: row.service_id || null,
        serviceStartMinutes: row.service_start_time ? parseTime(row.service_start_time.slice(0, 5)) : null,
        isOpen: row.is_open !== false,
      }));
    },
    async saveStaffSlot(slot, staffKey) {
      const salon = await salonPromise;
      const { error } = await client.from("staff_slot_overrides").upsert({
        salon_id: salon.id,
        staff_key: staffKey,
        slot_date: slot.date,
        start_time: `${formatMinutes(slot.startMinutes)}:00`,
        service_id: slot.serviceId,
        service_start_time: Number.isFinite(slot.serviceStartMinutes) ? `${formatMinutes(slot.serviceStartMinutes)}:00` : null,
        is_open: slot.isOpen !== false,
      }, { onConflict: "salon_id,staff_key,slot_date,start_time" });
      if (error) saveLocalStaffSlot(slot, staffKey);
    },
    async deleteStaffSlot(date, staffKey, startMinutes) {
      const salon = await salonPromise;
      const { error } = await client.from("staff_slot_overrides")
        .delete()
        .eq("salon_id", salon.id)
        .eq("staff_key", staffKey)
        .eq("slot_date", date)
        .eq("start_time", `${formatMinutes(startMinutes)}:00`);
      if (error) deleteLocalStaffSlot(date, staffKey, startMinutes);
    },
    async createBlockedSlot(block) {
      const salon = await salonPromise;
      const { error } = await client.rpc("create_admin_block", {
        p_salon_id: salon.id,
        p_block_date: block.date,
        p_start_time: `${formatMinutes(block.startMinutes)}:00`,
        p_service_id: block.serviceId,
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
    async setDayBlocked(settings) {
      const salon = await salonPromise;
      const { error } = await client.rpc("set_admin_day_block", {
        p_salon_id: salon.id,
        p_block_date: settings.date,
        p_is_blocked: settings.isBlockedDay,
        p_open_time: `${formatMinutes(settings.openMinutes)}:00`,
        p_close_time: `${formatMinutes(settings.closeMinutes)}:00`,
      });
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

function createDefaultLaneLayout() {
  const laneCount = getCurrentSalonSlug() === "liyong" ? 2 : 3;
  return LEGACY_LANE_DEFINITIONS.slice(0, laneCount).map((lane) => ({
    ...lane,
    staffKey: "default",
    staffName: "Mitarbeiter 1",
  }));
}

function normalizeLaneLayout(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return createDefaultLaneLayout();
  const supported = new Map(LEGACY_LANE_DEFINITIONS.map((lane) => [lane.laneKey, lane]));
  const normalized = rows
    .filter((row) => supported.has(String(row.laneKey || "").toLowerCase()))
    .map((row) => {
      const laneKey = String(row.laneKey).toLowerCase();
      const legacy = supported.get(laneKey);
      return {
        ...legacy,
        staffLaneId: row.staffLaneId || null,
        label: row.label || legacy.label,
        sortOrder: Number(row.sortOrder ?? legacy.sortOrder),
        staffKey: row.staffKey || "default",
        staffName: row.staffName || "Mitarbeiter 1",
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return normalized.length > 0 ? normalized : createDefaultLaneLayout();
}

function createLocalRepository() {
  return {
    authSupported: false,
    async getCurrentUser() { return { email: "local-demo" }; },
    onAuthChange() {},
    async signIn() {},
    async signOut() {},
    async listServices() { return loadLocalServices(); },
    async listLaneLayout() { return createDefaultLaneLayout(); },
    async listManualScheduleEntries() { return null; },
    async createManualScheduleEntry() { throw new Error("Unified schedule entries are unavailable in local mode"); },
    async deleteManualScheduleEntry() { throw new Error("Unified schedule entries are unavailable in local mode"); },
    async listAppointments(date) {
      const appointments = isLaneDemo() ? [] : loadLocalAppointments();
      return appointments.filter((appointment) => appointment.date === date);
    },
    async listAppointmentsFrom(startDate) {
      return loadLocalAppointments().filter((appointment) => appointment.date >= startDate);
    },
    async cancelAppointment(id) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loadLocalAppointments().map((appointment) => appointment.id === id ? { ...appointment, status: "cancelled", cancelledBy: "owner" } : appointment)));
    },
    async sendBookingEmail() {
      return "预约已取消。本地演示版不会发送邮件。";
    },
    async getDaySettings(date) { return loadLocalSettings()[date] || createDefaultDaySettings(date); },
    async listTimeBlocks(date) {
      if (isLaneDemo()) return previewTimeBlocksByDate.get(date) || [];
      return JSON.parse(localStorage.getItem(TIME_BLOCKS_KEY) || "[]").filter((block) => block.date === date);
    },
    async createTimeBlock(block) {
      const occupied = [
        ...state.appointments.filter((appointment) => appointment.status !== "cancelled"),
        ...getAllManualGroups().filter((item) => item.serviceId),
      ].flatMap((item) => getOccupiedRanges(item).map((range) => range.startMinutes));
      if (occupied.some((minutes) => minutes >= block.startMinutes && minutes < block.endMinutes)) {
        throw new Error("OCCUPIED_SLOTS_PRESENT");
      }
      if (isLaneDemo()) {
        const blocks = previewTimeBlocksByDate.get(block.date) || [];
        blocks.push({ ...block, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) });
        previewTimeBlocksByDate.set(block.date, blocks);
        return;
      }
      const blocks = JSON.parse(localStorage.getItem(TIME_BLOCKS_KEY) || "[]");
      blocks.push({ ...block, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) });
      localStorage.setItem(TIME_BLOCKS_KEY, JSON.stringify(blocks));
    },
    async deleteTimeBlock(blockId) {
      if (isLaneDemo()) {
        for (const [date, blocks] of previewTimeBlocksByDate.entries()) {
          previewTimeBlocksByDate.set(date, blocks.filter((block) => block.id !== blockId));
        }
        return;
      }
      const blocks = JSON.parse(localStorage.getItem(TIME_BLOCKS_KEY) || "[]");
      localStorage.setItem(TIME_BLOCKS_KEY, JSON.stringify(blocks.filter((block) => block.id !== blockId)));
    },
    async listBlockedSlots(date) {
      if (isLaneDemo()) return (await loadPreviewSchedule(date)).laneA;
      return loadLocalBlocks().filter((block) => block.date === date);
    },
    async listStaffSlots(date, staffKey) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(date);
        return staffKey === "overflow" ? schedule.laneB : schedule.laneC;
      }
      return loadLocalStaffSlots(date, staffKey);
    },
    async saveStaffSlot(slot, staffKey) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(slot.date);
        const lane = staffKey === "overflow" ? schedule.laneB : schedule.laneC;
        const existingIndex = lane.findIndex((item) => item.startMinutes === slot.startMinutes);
        const nextSlot = { ...slot, staffKey };
        if (existingIndex >= 0) lane.splice(existingIndex, 1, nextSlot);
        else lane.push(nextSlot);
        return;
      }
      saveLocalStaffSlot(slot, staffKey);
    },
    async deleteStaffSlot(date, staffKey, startMinutes) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(date);
        const lane = staffKey === "overflow" ? schedule.laneB : schedule.laneC;
        const existingIndex = lane.findIndex((item) => item.startMinutes === startMinutes);
        if (existingIndex >= 0) lane.splice(existingIndex, 1);
        return;
      }
      deleteLocalStaffSlot(date, staffKey, startMinutes);
    },
    async createBlockedSlot(block) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(block.date);
        schedule.laneA.push({ ...block, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) });
        return;
      }
      const blocks = loadLocalBlocks();
      blocks.push({ ...block, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) });
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks));
    },
    async deleteBlockedSlot(blockId) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(els.adminDateInput.value);
        const existingIndex = schedule.laneA.findIndex((block) => block.id === blockId);
        if (existingIndex >= 0) schedule.laneA.splice(existingIndex, 1);
        return;
      }
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(loadLocalBlocks().filter((block) => block.id !== blockId)));
    },
    async saveDaySettings(settings) {
      const values = loadLocalSettings();
      values[settings.date] = settings;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(values));
    },
    async setDayBlocked(settings) {
      if (settings.isBlockedDay) {
        const occupied = [
          ...state.appointments.filter((appointment) => appointment.status !== "cancelled"),
          ...getAllManualGroups().filter((item) => item.serviceId),
        ].some((item) => getOccupiedRanges(item).length > 0);
        if (occupied) throw new Error("OCCUPIED_SLOTS_PRESENT");
      }
      await this.saveDaySettings(settings);
    },
  };
}

function buildAdminSlots() {
  if (state.daySettings.isBlockedDay) return [];
  const activeAppointments = state.appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  const { laneA, laneB, laneC } = allocateAppointmentLanes(activeAppointments);
  const slots = [];
  for (let start = state.daySettings.openMinutes; start + SLOT_STEP <= state.daySettings.closeMinutes; start += SLOT_STEP) {
    const candidate = { startMinutes: start, endMinutes: start + SLOT_STEP };
    slots.push({
      ...candidate,
      laneAAppointment: findCoverageAt(laneA, start),
      laneBAppointment: findCoverageAt(laneB, start),
      laneCAppointment: findCoverageAt(laneC, start),
      laneABlock: findCoverageAt(state.blockedSlots, start),
    });
  }
  return slots;
}

let previewSchedulePromise = null;
const previewSchedulesByDate = new Map();
const previewTimeBlocksByDate = new Map();

function isLaneDemo() {
  return new URLSearchParams(window.location.search).get("demo") === "lanes";
}

async function loadPreviewSchedule(date) {
  if (previewSchedulesByDate.has(date)) return previewSchedulesByDate.get(date);
  if (!previewSchedulePromise) {
    previewSchedulePromise = fetch(new URL("../../info/blocked_slots_rows.csv", window.location.href))
      .then((response) => {
        if (!response.ok) throw new Error(`CSV konnte nicht geladen werden (${response.status})`);
        return response.text();
      })
      .then(parsePreviewCsv);
  }
  const records = (await previewSchedulePromise)
    .filter((item) => item.date === date && item.sourceServiceId?.startsWith("lisa_"))
    .sort((left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes);
  const laneRecords = { laneA: [], laneB: [], laneC: [] };
  records.forEach((record) => {
    const laneName = ["laneA", "laneB", "laneC"].find((candidate) => !hasTimeRangeOverlap(record, laneRecords[candidate]));
    if (!laneName) return;
    laneRecords[laneName].push(record);
  });
  const expandStaffLane = (recordsInLane, staffKey) => recordsInLane.flatMap((record) => (
    getServiceCoveredMinutes(findService(record.serviceId), record.startMinutes).map((coveredStart) => ({
        date: record.date,
        staffKey,
        startMinutes: coveredStart,
        serviceId: record.serviceId,
        serviceStartMinutes: record.startMinutes,
        isOpen: true,
      }))
  ));
  const schedule = {
    laneA: laneRecords.laneA,
    laneB: expandStaffLane(laneRecords.laneB, "overflow"),
    laneC: expandStaffLane(laneRecords.laneC, "flexible"),
  };
  previewSchedulesByDate.set(date, schedule);
  return schedule;
}

function parsePreviewCsv(text) {
  const rows = parseCsvRows(text.trim());
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])))
    .map((row) => ({
      id: row.id,
      date: row.block_date,
      startMinutes: parseTime(row.start_time.slice(0, 5)),
      endMinutes: parseTime(row.end_time.slice(0, 5)),
      occupiedMinutes: JSON.parse(row.occupied_slots || "[]").map((value) => parseTime(String(value).slice(0, 5))),
      serviceId: row.service_id ? stripSalonPrefix(row.service_id) : null,
      sourceServiceId: row.service_id || null,
      serviceStartMinutes: parseTime((row.service_start_time || row.start_time).slice(0, 5)),
      reason: row.reason || "",
    }));
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  rows.push(row);
  return rows;
}

function allocateAppointmentLanes(appointments) {
  const laneA = [];
  const laneB = [];
  const laneC = [];
  appointments.forEach((appointment) => {
    const requestedLane = String(appointment.laneKey || "").toLowerCase();
    if (requestedLane === "a") {
      laneA.push(appointment);
    } else if (requestedLane === "b") {
      laneB.push(appointment);
    } else if (requestedLane === "c") {
      laneC.push(appointment);
    } else if (!hasTimeRangeOverlap(appointment, laneA)) {
      laneA.push(appointment);
    } else if (!hasTimeRangeOverlap(appointment, laneB)) {
      laneB.push(appointment);
    } else {
      laneC.push(appointment);
    }
  });
  return { laneA, laneB, laneC };
}

function hasTimeRangeOverlap(candidate, appointments) {
  return appointments.some((appointment) => (
    candidate.startMinutes < appointment.endMinutes
    && candidate.endMinutes > appointment.startMinutes
  ));
}

function findCoverageAt(appointments, startMinutes) {
  return appointments.find((appointment) => (
    startMinutes >= appointment.startMinutes
    && startMinutes < appointment.endMinutes
  )) || null;
}

function findStaffServiceCoverageAt(staffSlots, startMinutes) {
  return staffSlots.find((item) => item.serviceId && item.startMinutes === startMinutes) || null;
}

function getLaneAppointments(lane) {
  const allocated = allocateAppointmentLanes(state.appointments.filter((item) => item.status !== "cancelled"));
  if (lane === "primary") return allocated.laneA;
  if (lane === "overflow") return allocated.laneB;
  return allocated.laneC;
}

function getLaneManualGroups(lane) {
  if (lane === "primary") return state.blockedSlots;
  return groupStaffOverrides(getStaffSlots(lane));
}

function getAllManualGroups() {
  return [
    ...state.blockedSlots.map((item) => ({ ...item, lane: "primary" })),
    ...groupStaffOverrides(state.overflowSlots).map((item) => ({ ...item, lane: "overflow" })),
    ...groupStaffOverrides(state.flexibleSlots).map((item) => ({ ...item, lane: "flexible" })),
  ];
}

function groupStaffOverrides(staffSlots) {
  const groups = new Map();
  staffSlots.forEach((item) => {
    if (!item.serviceId && item.isOpen !== false) return;
    const groupStart = item.serviceStartMinutes ?? item.startMinutes;
    const key = item.serviceId ? `${item.serviceId}:${groupStart}` : `blocked:${item.startMinutes}`;
    if (!groups.has(key)) {
      const service = item.serviceId ? findService(item.serviceId) : null;
      groups.set(key, {
        ...item,
        startMinutes: groupStart,
        endMinutes: groupStart + (service?.duration || SLOT_STEP),
        occupiedMinutes: service ? getServiceOccupiedMinutes(service, groupStart) : [item.startMinutes],
      });
    }
  });
  return [...groups.values()];
}

function isLaneCoveredGap(item, startMinutes) {
  if (!item) return false;
  if (!Number.isFinite(item.endMinutes)) {
    const service = findService(item.serviceId);
    const serviceStart = item.serviceStartMinutes ?? item.startMinutes;
    if (startMinutes < serviceStart || startMinutes >= serviceStart + service.duration) return false;
    return !getServiceOccupiedMinutes(service, serviceStart).includes(startMinutes);
  }
  if (startMinutes < item.startMinutes || startMinutes >= item.endMinutes) return false;
  return !getOccupiedRanges(item).some((range) => range.startMinutes === startMinutes);
}

function getCoverageStarts(item) {
  const starts = [];
  for (let start = item.startMinutes; start < item.endMinutes; start += SLOT_STEP) starts.push(start);
  return starts;
}

function getCoverageEdgeClasses(item, startMinutes) {
  const starts = getCoverageStarts(item);
  return [
    starts.length === 1 ? "booking-single" : "",
    startMinutes === starts[0] ? "booking-first" : "",
    startMinutes === starts[starts.length - 1] ? "booking-last" : "",
    starts.includes(startMinutes - SLOT_STEP) ? "booking-contiguous-prev" : "",
    starts.includes(startMinutes + SLOT_STEP) ? "booking-contiguous-next" : "",
  ].filter(Boolean).join(" ");
}

function findOverlap(candidate, ranges) {
  return ranges.find((range) => hasOverlap(candidate, [range]));
}

function getDateStatus(option) {
  if (!option.isBusinessDay || option.isBlockedDay) return "date-closed";
  const ratio = option.totalSlotCount > 0 ? option.occupiedSlotCount / option.totalSlotCount : 0;
  if (ratio >= 1) return "date-load-full";
  if (ratio > 0.75) return "date-load-dark-red";
  if (ratio > 0.5) return "date-load-red";
  if (ratio > 0.25) return "date-load-yellow";
  return "date-load-green";
}

function countDaySlots(daySettings) {
  if (!daySettings || !isScheduledBusinessDay(daySettings.date)) return 0;
  return Math.max(0, Math.floor((daySettings.closeMinutes - daySettings.openMinutes) / SLOT_STEP));
}

function isScheduledBusinessDay(date) {
  return getWeeklyRule(new Date(`${date}T00:00:00`)).openMinutes !== null;
}

function countOccupiedSlots(appointments, blockedSlots = [], overflowSlots = [], flexibleSlots = [], daySettings = null, timeBlocks = []) {
  const occupied = new Set();
  const addOccupiedRange = (range) => {
    if (daySettings && (range.startMinutes < daySettings.openMinutes || range.startMinutes >= daySettings.closeMinutes)) return;
    occupied.add(range.startMinutes);
  };
  appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .forEach((appointment) => getOccupiedRanges(appointment).forEach(addOccupiedRange));
  blockedSlots.forEach((block) => {
    getOccupiedRanges(block).forEach(addOccupiedRange);
  });
  [...groupStaffOverrides(overflowSlots), ...groupStaffOverrides(flexibleSlots)].forEach((item) => {
    getOccupiedRanges(item).forEach(addOccupiedRange);
  });
  timeBlocks.forEach((block) => {
    for (let startMinutes = block.startMinutes; startMinutes < block.endMinutes; startMinutes += SLOT_STEP) {
      addOccupiedRange({ startMinutes });
    }
  });
  return occupied.size;
}

function getOccupiedEdgeClasses(item, startMinutes) {
  const occupiedStarts = getOccupiedRanges(item).map((range) => range.startMinutes).sort((a, b) => a - b);
  return [
    occupiedStarts.length === 1 ? "booking-single" : "",
    startMinutes === occupiedStarts[0] ? "booking-first" : "",
    startMinutes === occupiedStarts[occupiedStarts.length - 1] ? "booking-last" : "",
    occupiedStarts.includes(startMinutes - SLOT_STEP) ? "booking-contiguous-prev" : "",
    occupiedStarts.includes(startMinutes + SLOT_STEP) ? "booking-contiguous-next" : "",
  ].filter(Boolean).join(" ");
}

function getEditableServiceName(service) {
  return service.name;
}

function getServiceAbbrev(service) {
  return service.shortName || Array.from(getEditableServiceName(service)).slice(0, 3).join("");
}

function findService(id) {
  return state.services.find((service) => service.id === id) || { id, name: id, duration: 30, price: 0, isActive: false };
}

function sortServices(services) {
  return services.slice().sort((a, b) => (getServiceSortIndex(a.id) - getServiceSortIndex(b.id)) || a.name.localeCompare(b.name));
}

function getServiceOccupiedMinutes(service, startMinutes) {
  const bookedSlots = Array.isArray(service.bookedSlots) && service.bookedSlots.length > 0
    ? service.bookedSlots
    : Array.from({ length: Math.ceil(service.duration / SLOT_STEP) }, (_, index) => index + 1);
  return bookedSlots.map((slotNumber) => startMinutes + ((slotNumber - 1) * SLOT_STEP));
}

function getServiceCoveredMinutes(service, startMinutes) {
  return Array.from(
    { length: Math.ceil(service.duration / SLOT_STEP) },
    (_, index) => startMinutes + (index * SLOT_STEP),
  );
}

function getServiceSortIndex(id) {
  return SERVICE_ORDER.get(stripSalonPrefix(id)) ?? 999;
}

function hasOverlap(candidate, ranges) {
  const candidateRanges = getOccupiedRanges(candidate);
  return ranges.some((range) => (
    range.status !== "cancelled"
    && candidateRanges.some((candidateRange) => getOccupiedRanges(range).some((occupiedRange) => (
      candidateRange.startMinutes < occupiedRange.endMinutes
      && candidateRange.endMinutes > occupiedRange.startMinutes
    )))
  ));
}

function getOccupiedRanges(item) {
  if (Array.isArray(item.occupiedMinutes) && item.occupiedMinutes.length > 0) {
    return item.occupiedMinutes.map((startMinutes) => ({ startMinutes, endMinutes: startMinutes + SLOT_STEP }));
  }
  return [{ startMinutes: item.startMinutes, endMinutes: item.endMinutes }];
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

function getWeeklyRule(date) {
  return WEEKLY_HOURS.find((day) => day.index === date.getDay()) || WEEKLY_HOURS[0];
}

function formatDateButtonLabel(date) {
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
    day: lang === "zh" ? String(date.getDate()) : new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
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

function formatSelectedDateTitle(dateValue, slotCount = "") {
  const date = new Date(`${dateValue}T00:00:00`);
  const lang = window.OpenSlotI18n?.language || "de";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(".", "");
  return `am ${dateValue} ${weekday}${slotCount ? ` (${slotCount})` : ""}`;
}

async function scrollDateStrip(direction) {
  let dateRow = els.adminDateStrip?.querySelector(".date-row");
  if (!dateRow) return;
  const buttons = [...dateRow.querySelectorAll(".date-button")];
  if (buttons.length === 0) return;
  const isPortraitPager = window.matchMedia("(orientation: portrait) and (max-width: 1180px)").matches;
  const pageSize = isPortraitPager ? Math.min(7, buttons.length) : getVisibleDateCount(dateRow, buttons);
  const currentIndex = getDateRowStartIndex(dateRow, buttons);
  const currentPageStart = Math.floor(currentIndex / pageSize) * pageSize;
  const targetIndex = Math.max(0, Math.min(currentPageStart + (direction * pageSize), buttons.length - pageSize));

  if (isPortraitPager) {
    const firstSelectable = buttons.slice(targetIndex, targetIndex + pageSize).find((button) => !button.disabled);
    if (firstSelectable && firstSelectable.dataset.date !== els.adminDateInput.value) {
      els.adminDateInput.value = firstSelectable.dataset.date;
      await refreshDayData();
      dateRow = els.adminDateStrip?.querySelector(".date-row");
    }
  }

  if (dateRow) scrollDateRowToIndex(dateRow, targetIndex);
}

function getVisibleDateCount(dateRow, buttons) {
  if (buttons.length < 2) return 1;
  const step = buttons[1].offsetLeft - buttons[0].offsetLeft;
  return step > 0 ? Math.max(1, Math.floor((dateRow.clientWidth + 1) / step)) : 1;
}

function getDateRowStartIndex(dateRow, buttons) {
  if (buttons.length < 2) return 0;
  const step = buttons[1].offsetLeft - buttons[0].offsetLeft;
  return step > 0 ? Math.max(0, Math.round(dateRow.scrollLeft / step)) : 0;
}

function scrollDateRowToIndex(dateRow, index) {
  const buttons = [...dateRow.querySelectorAll(".date-button")];
  const firstButton = buttons[0];
  const targetButton = buttons[index];
  if (!firstButton || !targetButton) return;
  dateRow.scrollTo({ left: targetButton.offsetLeft - firstButton.offsetLeft, behavior: "smooth" });
}

function getCustomerNameSizeClass(name) {
  if (name.length > 22) return "customer-name customer-name-compact";
  if (name.length > 14) return "customer-name customer-name-long";
  return "customer-name";
}

function fromSupabaseService(row) {
  const baseId = stripSalonPrefix(row.id);
  const fallback = DEFAULT_SERVICES.find((service) => service.id === baseId);
  const legacy = LEGACY_SERVICE_META.get(baseId);
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name || row.name,
    duration: row.duration_minutes,
    bookedSlots: row.booked_slots || [],
    price: Number(row.price),
    priceFrom: Boolean(row.price_from),
    slotColor: row.slot_color || "",
    category: row.category || fallback?.category || legacy?.category || "care",
    gender: fallback?.gender || legacy?.gender || row.gender || "unisex",
    isActive: row.is_active,
  };
}

function stripSalonPrefix(id) {
  return String(id || "").replace(/^(lisa|liyong)_/, "");
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
    occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
    laneKey: row.lane_key || null,
    status: row.status,
  };
}

function fromSupabaseScheduleEntry(row) {
  const lane = Array.isArray(row.staff_lanes) ? row.staff_lanes[0] : row.staff_lanes;
  const startMinutes = parseTime(String(row.covered_start).slice(0, 5));
  return {
    id: row.id,
    date: row.schedule_date,
    startMinutes,
    endMinutes: parseTime(String(row.covered_end).slice(0, 5)),
    occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
    serviceId: row.service_id || null,
    serviceStartMinutes: startMinutes,
    laneKey: lane?.lane_key || null,
    isOpen: row.entry_source !== "block",
    entrySource: row.entry_source,
  };
}

function isMissingUnifiedSchedule(error) {
  return ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code);
}

function timeValueToMinutes(value) {
  const text = String(value || "");
  return text.includes("T") ? dateToMinutes(text) : parseTime(text.slice(0, 5));
}

function fromSupabaseDaySettings(row) {
  return { date: row.setting_date, openMinutes: parseTime(row.open_time.slice(0, 5)), closeMinutes: parseTime(row.close_time.slice(0, 5)), isBlockedDay: row.is_blocked_day };
}

function fromSupabaseTimeBlock(row) {
  return {
    id: row.id,
    date: row.block_date,
    startMinutes: parseTime(String(row.start_time).slice(0, 5)),
    endMinutes: parseTime(String(row.end_time).slice(0, 5)),
  };
}

function fromSupabaseBlockedSlot(row) {
  return {
    id: row.id,
    date: row.block_date,
    startMinutes: parseTime(row.start_time.slice(0, 5)),
    endMinutes: parseTime(row.end_time.slice(0, 5)),
    occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
    serviceId: row.service_id || null,
    serviceStartMinutes: row.service_start_time ? parseTime(row.service_start_time.slice(0, 5)) : parseTime(row.start_time.slice(0, 5)),
    reason: row.reason || "",
  };
}

function loadLocalAppointments() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
function loadLocalSettings() { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
function loadLocalBlocks() { return JSON.parse(localStorage.getItem(BLOCKS_KEY) || "[]"); }
function loadLocalStaffSlots(date, staffKey) {
  return JSON.parse(localStorage.getItem(FLEXIBLE_SLOTS_KEY) || "[]")
    .filter((slot) => slot.date === date && (slot.staffKey || "flexible") === staffKey);
}
function saveLocalStaffSlot(slot, staffKey) {
  const slots = JSON.parse(localStorage.getItem(FLEXIBLE_SLOTS_KEY) || "[]")
    .filter((item) => item.date !== slot.date || (item.staffKey || "flexible") !== staffKey || item.startMinutes !== slot.startMinutes);
  slots.push({ ...slot, staffKey });
  localStorage.setItem(FLEXIBLE_SLOTS_KEY, JSON.stringify(slots));
}
function deleteLocalStaffSlot(date, staffKey, startMinutes) {
  const slots = JSON.parse(localStorage.getItem(FLEXIBLE_SLOTS_KEY) || "[]")
    .filter((item) => item.date !== date || (item.staffKey || "flexible") !== staffKey || item.startMinutes !== startMinutes);
  localStorage.setItem(FLEXIBLE_SLOTS_KEY, JSON.stringify(slots));
}
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
