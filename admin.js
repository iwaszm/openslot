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
const LIVE_REFRESH_MS = 20 * 1000;
const DATE_OPTIONS_REFRESH_MS = 10 * 60 * 1000;
const LOCAL_STORAGE_NAMESPACE = window.OPENSLOT_LOCAL_STORAGE_NAMESPACE || "openslot.barber.mvp";
const STORAGE_KEY = `${LOCAL_STORAGE_NAMESPACE}.appointments`;
const SETTINGS_KEY = `${LOCAL_STORAGE_NAMESPACE}.day-settings`;
const BLOCKS_KEY = `${LOCAL_STORAGE_NAMESPACE}.blocked-slots`;
const SERVICES_KEY = `${LOCAL_STORAGE_NAMESPACE}.services`;
const FLEXIBLE_SLOTS_KEY = `${LOCAL_STORAGE_NAMESPACE}.flexible-staff-slots`;
const TIME_BLOCKS_KEY = `${LOCAL_STORAGE_NAMESPACE}.time-blocks`;
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
  { laneKey: "d", storageKey: "lane-d", label: "D", sortOrder: 4 },
];

const state = {
  appointments: [],
  blockedSlots: [],
  overflowSlots: [],
  flexibleSlots: [],
  manualEntries: [],
  timeBlocks: [],
  upcomingAppointments: [],
  dateOptions: [],
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  isOwner: false,
  accessRole: null,
  accessStaffId: null,
  logCollapsed: false,
  repository: null,
  services: DEFAULT_SERVICES,
  salon: null,
  laneLayout: createDefaultLaneLayout(),
  useUnifiedScheduleEntries: false,
  datePageStart: 0,
  visibleStaffKey: "all",
};
let liveRefreshInFlight = false;
let lastDateOptionsRefresh = 0;
let pendingDayRender = false;
let dayRefreshSequence = 0;
let logRefreshSequence = 0;
let dateOptionsRefreshSequence = 0;
let toastTimeout = null;

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
  adminSyncNotice: document.querySelector("#adminSyncNotice"),
  adminDateInput: document.querySelector("#adminDateInput"),
  adminDateStrip: document.querySelector("#adminDateStrip"),
  calendarMonth: document.querySelector("#calendarMonth"),
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
  todayButton: document.querySelector("#todayButton"),
  availabilityToggle: document.querySelector("#availabilityToggle"),
  availabilityPanel: document.querySelector("#availabilityPanel"),
  availabilityStaff: document.querySelector("#availabilityStaff"),
  existingTimeBlocks: document.querySelector("#existingTimeBlocks"),
  addBookingButton: document.querySelector("#addBookingButton"),
  bookingDialog: document.querySelector("#bookingDialog"),
  manualBookingForm: document.querySelector("#manualBookingForm"),
  bookingEmployee: document.querySelector("#bookingEmployee"),
  bookingCategory: document.querySelector("#bookingCategory"),
  bookingService: document.querySelector("#bookingService"),
  bookingStart: document.querySelector("#bookingStart"),
  bookingNote: document.querySelector("#bookingNote"),
  bookingFormMessage: document.querySelector("#bookingFormMessage"),
  detailDialog: document.querySelector("#detailDialog"),
  detailTitle: document.querySelector("#detailTitle"),
  detailList: document.querySelector("#detailList"),
  actionToast: document.querySelector("#actionToast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastClose: document.querySelector("#toastClose"),
};

function setAdminMessage(message) {
  if (els.adminMessage) els.adminMessage.textContent = "";
  if (message) showToast(message, /fehl|失败|nicht|error/i.test(message) ? "error" : "success");
}

function showToast(message, tone = "success") {
  if (!els.actionToast || !els.toastMessage) return;
  window.clearTimeout(toastTimeout);
  els.actionToast.classList.toggle("error", tone === "error");
  els.toastMessage.textContent = message;
  els.actionToast.hidden = false;
  toastTimeout = window.setTimeout(() => { els.actionToast.hidden = true; }, 4500);
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
  startLiveRefresh();
}

function startLiveRefresh() {
  window.setInterval(refreshLiveData, LIVE_REFRESH_MS);
  window.addEventListener("online", refreshLiveData);
  window.addEventListener("focus", refreshLiveData);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshLiveData();
  });
}

function isEditingSchedule() {
  return Boolean(document.querySelector(".confirm-dialog[open], .service-block-menu[open], #timeBlockPanel:not([hidden])"))
    || Boolean(document.activeElement?.closest("#ownerControls input, #ownerControls select, #ownerControls textarea"));
}

async function refreshLiveData() {
  if (liveRefreshInFlight || document.hidden || !navigator.onLine || !state.isOwner) return;
  liveRefreshInFlight = true;
  try {
    const today = toDateInputValue(new Date());
    const rolledOver = els.adminDateInput.value < today;
    if (rolledOver) {
      els.adminDateInput.value = today;
      els.adminDateInput.min = today;
    }
    const previousLog = JSON.stringify(state.upcomingAppointments);
    const [dayOk, logOk] = await Promise.all([
      refreshDayData({ onlyIfChanged: true }),
      refreshUpcomingLog({ onlyIfChanged: true }),
    ]);
    let datesOk = true;
    if (rolledOver || Date.now() - lastDateOptionsRefresh >= DATE_OPTIONS_REFRESH_MS
      || (logOk && previousLog !== JSON.stringify(state.upcomingAppointments))) {
      datesOk = await refreshDateOptions({ keepOnError: true });
    }
    if (!state.isOwner) return;
    if (els.adminSyncNotice) els.adminSyncNotice.hidden = dayOk && logOk && datesOk;
  } catch (error) {
    if (state.isOwner && els.adminSyncNotice) els.adminSyncNotice.hidden = false;
    console.warn("Admin refresh failed:", error);
  } finally {
    liveRefreshInFlight = false;
  }
}

function bindEvents() {
  els.ownerLoginForm?.addEventListener("submit", handleOwnerLogin);
  els.ownerLogoutButton?.addEventListener("click", handleOwnerLogout);
  els.adminDateInput?.addEventListener("change", refreshDayData);
  els.adminDatePrevButton?.addEventListener("click", () => changeDatePage(-1));
  els.adminDateNextButton?.addEventListener("click", () => changeDatePage(1));
  els.todayButton?.addEventListener("click", selectToday);
  els.availabilityToggle?.addEventListener("click", toggleAvailabilityPanel);
  els.availabilityStaff?.addEventListener("change", () => {
    state.visibleStaffKey = els.availabilityStaff.value;
    closeAvailabilityPanel();
    renderSlotManager();
  });
  els.addBookingButton?.addEventListener("click", openManualBookingDialog);
  els.manualBookingForm?.addEventListener("submit", submitManualBooking);
  els.bookingEmployee?.addEventListener("change", updateManualBookingTimes);
  els.bookingCategory?.addEventListener("change", updateManualServiceOptions);
  els.bookingService?.addEventListener("change", updateManualBookingTimes);
  document.querySelectorAll("[data-close-admin-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog")?.close()));
  els.dayBlockButton?.addEventListener("click", handleToggleDayBlock);
  els.timeBlockToggle?.addEventListener("click", toggleTimeBlockPanel);
  els.timeBlockStart?.addEventListener("change", renderTimeBlockControls);
  els.timeBlockEnd?.addEventListener("change", renderTimeBlockControls);
  els.timeBlockAction?.addEventListener("click", handleCreateTimeBlock);
  els.existingTimeBlocks?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-unblock-time]");
    if (button) deleteTimeBlockById(button.dataset.unblockTime);
  });
  els.toastClose?.addEventListener("click", () => {
    window.clearTimeout(toastTimeout);
    if (els.actionToast) els.actionToast.hidden = true;
  });
  els.logCollapseButton?.addEventListener("click", () => toggleSection("log"));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".service-block-menu")) closeServiceBlockMenus();
    if (!event.target.closest(".availability-shell")) closeAvailabilityPanel();
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
  window.OpenSlotAdminClient = client;
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
  state.accessStaffId = null;

  if (!user) {
    renderAuthState(null);
    return;
  }

  try {
    const access = await state.repository.getSalonAccess(user.id);
    state.isOwner = access.allowed;
    state.accessRole = access.role;
    state.accessStaffId = access.staffId || null;
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
  const result = { blockedSlots: [], overflowSlots: [], flexibleSlots: [], allEntries: [] };
  entries.forEach((entry) => {
    const item = { ...entry, scheduleEntryId: entry.id };
    result.allEntries.push(item);
    if (entry.laneKey === "a") {
      result.blockedSlots.push(item);
    } else if (entry.laneKey === "b") {
      result.overflowSlots.push(item);
    } else if (entry.laneKey === "c" || entry.laneKey === "d") {
      result.flexibleSlots.push(item);
    }
  });
  return result;
}

async function refreshDateOptions({ keepOnError = false } = {}) {
  if (!els.adminDateInput || !els.adminDateStrip) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const dates = buildDateRange();
  const requestId = ++dateOptionsRefreshSequence;
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
    if (requestId !== dateOptionsRefreshSequence || (!state.isOwner && state.repository.authSupported)) return true;
    state.dateOptions = summaries;
    lastDateOptionsRefresh = Date.now();
  } catch (error) {
    if (requestId !== dateOptionsRefreshSequence) return true;
    if (keepOnError) {
      console.warn("Calendar refresh failed:", error);
      return false;
    }
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
  return true;
}

async function refreshDayData({ onlyIfChanged = false } = {}) {
  if (!els.adminDateInput || !els.appointmentList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const requestId = ++dayRefreshSequence;
  try {
    const date = els.adminDateInput.value;
    const [appointments, daySettings, manualSchedule, timeBlocks] = await Promise.all([
      state.repository.listAppointments(date),
      state.repository.getDaySettings(date),
      loadManualSchedule(date),
      state.repository.listTimeBlocks(date),
    ]);
    if (requestId !== dayRefreshSequence || date !== els.adminDateInput.value
      || (!state.isOwner && state.repository.authSupported)) return true;
    const changed = pendingDayRender || !onlyIfChanged || JSON.stringify([
      state.appointments, state.daySettings, state.blockedSlots, state.overflowSlots,
      state.flexibleSlots, state.manualEntries, state.timeBlocks,
    ]) !== JSON.stringify([
      appointments, daySettings, manualSchedule.blockedSlots, manualSchedule.overflowSlots,
      manualSchedule.flexibleSlots, manualSchedule.allEntries || [], timeBlocks,
    ]);
    state.appointments = appointments;
    state.daySettings = daySettings;
    state.blockedSlots = manualSchedule.blockedSlots;
    state.overflowSlots = manualSchedule.overflowSlots;
    state.flexibleSlots = manualSchedule.flexibleSlots;
    state.manualEntries = manualSchedule.allEntries || [
      ...manualSchedule.blockedSlots,
      ...manualSchedule.overflowSlots,
      ...manualSchedule.flexibleSlots,
    ];
    state.timeBlocks = timeBlocks;
    state.useUnifiedScheduleEntries = manualSchedule.isUnified;
    if (changed) {
      if (onlyIfChanged && isEditingSchedule()) pendingDayRender = true;
      else {
        pendingDayRender = false;
        render();
      }
    }
  } catch (error) {
    if (requestId !== dayRefreshSequence) return true;
    setAdminMessage(`读取后台数据失败：${error.message}`);
    console.warn("Schedule refresh failed:", error);
    return false;
  }
  return true;
}

async function refreshUpcomingLog({ onlyIfChanged = false } = {}) {
  if (!els.upcomingLogList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const startDate = toDateInputValue(new Date());
  const requestId = ++logRefreshSequence;
  try {
    const appointments = await state.repository.listAppointmentsFrom(startDate);
    if (requestId !== logRefreshSequence || (!state.isOwner && state.repository.authSupported)) return true;
    if (!onlyIfChanged || JSON.stringify(appointments) !== JSON.stringify(state.upcomingAppointments)) {
      state.upcomingAppointments = appointments;
      renderUpcomingLog();
    }
  } catch (error) {
    if (requestId !== logRefreshSequence) return true;
    setAdminMessage(`读取预约记录失败：${error.message}`);
    console.warn("Booking log refresh failed:", error);
    return false;
  }
  return true;
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
  if (!state.isOwner && els.adminSyncNotice) els.adminSyncNotice.hidden = true;
  if (els.ownerLoginForm) els.ownerLoginForm.hidden = Boolean(user);
  if (els.ownerSession) els.ownerSession.hidden = !user;
  if (els.ownerEmailLabel) els.ownerEmailLabel.textContent = user?.email || "";
  if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = message;
}

function renderOwnerControls() {
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (!state.isOwner) return;
  if (els.availabilityToggle) els.availabilityToggle.hidden = state.accessRole === "staff";
}

function renderDateStrip() {
  if (!els.adminDateStrip || state.dateOptions.length === 0) return;
  const selectedDate = new Date(`${els.adminDateInput.value}T00:00:00`);
  if (els.calendarMonth) {
    els.calendarMonth.textContent = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(selectedDate);
  }
  const selectedIndex = Math.max(0, state.dateOptions.findIndex((option) => option.date === els.adminDateInput.value));
  if (selectedIndex < state.datePageStart || selectedIndex >= state.datePageStart + 7) {
    state.datePageStart = Math.floor(selectedIndex / 7) * 7;
  }
  const visibleOptions = state.dateOptions.slice(state.datePageStart, state.datePageStart + 7);
  els.adminDateStrip.className = `mini-day-strip ${state.datePageStart === 0 ? "today-page" : "future-page"}`;
  els.adminDateStrip.innerHTML = visibleOptions.map((option) => {
    const date = new Date(`${option.date}T00:00:00`);
    const label = formatDateButtonLabel(date);
    const isSelected = option.date === els.adminDateInput.value;
    const weeklyRule = getWeeklyRule(date);
    const isSelectable = weeklyRule.openMinutes !== null;
    const percent = option.totalSlotCount ? Math.min(100, Math.round(option.occupiedSlotCount / option.totalSlotCount * 100)) : 0;
    return `
      <button class="mini-day ${isSelected ? "selected" : ""}" type="button" data-date="${option.date}" aria-pressed="${isSelected}" ${isSelectable ? "" : "disabled"}>
        <span class="date-weekday">${escapeHtml(label.weekday)}</span>
        <strong>${escapeHtml(label.day)}</strong>
        ${isSelectable ? `<span class="day-status-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>` : ""}
      </button>
    `;
  }).join("");
  els.adminDatePrevButton.disabled = state.datePageStart === 0;
  els.adminDateNextButton.disabled = state.datePageStart + 7 >= state.dateOptions.length;
  const today = toDateInputValue(new Date());
  els.todayButton?.classList.toggle("is-active", els.adminDateInput.value === today);
  els.todayButton?.setAttribute("aria-pressed", String(els.adminDateInput.value === today));
  els.adminDateStrip.querySelectorAll(".mini-day:not(:disabled)").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.date === els.adminDateInput.value) return;
      els.adminDateInput.value = button.dataset.date;
      await refreshDayData();
    });
  });
}

async function changeDatePage(direction) {
  const nextStart = Math.max(0, Math.min(state.dateOptions.length - 1, state.datePageStart + direction * 7));
  if (nextStart === state.datePageStart) return;
  state.datePageStart = nextStart;
  const target = state.dateOptions[nextStart];
  if (target) {
    els.adminDateInput.value = target.date;
    await refreshDayData();
  }
}

async function selectToday() {
  const today = toDateInputValue(new Date());
  state.datePageStart = 0;
  els.adminDateInput.value = today;
  await refreshDayData();
}

function getScheduleLanes(activeAppointments) {
  const visibleLayout = getVisibleLaneLayout();
  const allocated = allocateAppointmentsByLane(activeAppointments, state.laneLayout);
  return visibleLayout.map((lane) => ({
    ...lane,
    appointments: allocated.get(lane.laneKey) || [],
    manual: state.useUnifiedScheduleEntries
      ? state.manualEntries.filter((entry) => entry.laneKey === lane.laneKey)
      : lane.laneKey === "a" ? state.blockedSlots
        : lane.laneKey === "b" ? groupStaffOverrides(state.overflowSlots)
          : lane.laneKey === "c" ? groupStaffOverrides(state.flexibleSlots) : [],
  }));
}

function getVisibleLaneLayout() {
  const groups = groupLanesByStaff(state.laneLayout).map((group) => group.lanes.slice(0, 2));
  const selected = state.visibleStaffKey === "all"
    ? groups
    : groups.filter((group) => group[0]?.staffKey === state.visibleStaffKey);
  return selected.flat();
}

function allocateAppointmentsByLane(appointments, layout) {
  const result = new Map(layout.map((lane) => [lane.laneKey, []]));
  appointments.forEach((appointment) => {
    const requested = String(appointment.laneKey || "").toLowerCase();
    let lane = result.has(requested) ? requested : null;
    if (!lane) lane = layout.find((candidate) => !hasTimeRangeOverlap(appointment, result.get(candidate.laneKey)))?.laneKey;
    if (lane) result.get(lane).push(appointment);
  });
  return result;
}

function renderSlotManager() {
  if (!els.appointmentList) return;
  const appointments = [...state.appointments].sort((a, b) => a.startMinutes - b.startMinutes);
  const activeAppointments = appointments.filter((appointment) => appointment.status !== "cancelled");
  const selectedDate = els.adminDateInput?.value || toDateInputValue(new Date());
  const lanes = getScheduleLanes(activeAppointments);
  if (els.appointmentCardTitle) {
    const visibleEntries = new Set(lanes.flatMap((lane) => [...lane.appointments, ...lane.manual]).map((entry) => entry.id || entry.scheduleEntryId));
    els.appointmentCardTitle.textContent = formatAdminDaySummary(selectedDate, visibleEntries.size);
  }
  if (els.bookingCount) els.bookingCount.textContent = activeAppointments.length;
  renderDayBlockButton();
  renderTimeBlockControls();
  renderAvailabilityStaffOptions();
  const slots = buildAdminSlots();
  if (slots.length === 0) {
    els.appointmentList.innerHTML = `<div class="empty-state">${state.daySettings.isBlockedDay ? t("admin.dayBlockedEmpty") : t("admin.emptyAppointments")}</div>`;
    return;
  }
  const staffGroups = groupLanesByStaff(lanes);
  const staffOrder = groupLanesByStaff(state.laneLayout).map((group) => group.key);
  els.appointmentList.innerHTML = `
    <div class="staff-schedule" style="--lane-count:${lanes.length}">
      <div class="staff-schedule-head" aria-hidden="true">
        <span></span>
        ${staffGroups.map((group) => {
          const staffNumber = Math.max(1, staffOrder.indexOf(group.key) + 1);
          return `<strong style="grid-column:${group.start + 2} / span ${group.lanes.length}"><span class="staff-avatar">${staffNumber}</span>Mitarbeiter ${staffNumber}</strong>`;
        }).join("")}
      </div>
      ${renderOutlookSchedule(slots, lanes)}
    </div>
  `;
  els.appointmentList.querySelectorAll("[data-time-block-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteTimeBlockById(button.dataset.timeBlockDelete));
  });
  els.appointmentList.querySelectorAll('[data-lane-action="clear"]').forEach((button) => {
    button.addEventListener("click", () => handleLaneAction(
      button.dataset.lane,
      button.dataset.start,
      "clear",
    ));
  });
  els.appointmentList.querySelectorAll(".service-block-menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) closeServiceBlockMenus(menu);
    });
  });
  els.appointmentList.querySelectorAll("[data-event-detail]").forEach((button) => {
    button.addEventListener("click", () => openScheduleDetail(button.dataset.eventDetail, button.dataset.eventKind));
  });
}

function formatAdminDaySummary(value, count) {
  const date = new Date(`${value}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date).replace(/\.$/, "");
  return `${month}, ${String(date.getDate()).padStart(2, "0")}, ${weekday}. (${count})`;
}

function groupLanesByStaff(lanes) {
  const groups = [];
  lanes.forEach((lane, index) => {
    const previous = groups.at(-1);
    if (previous?.key === lane.staffKey) previous.lanes.push(lane);
    else groups.push({ key: lane.staffKey, name: lane.staffName, start: index, lanes: [lane] });
  });
  return groups;
}

function canEditLane(lane) {
  return state.accessRole !== "staff" || (state.accessStaffId && lane.staffId === state.accessStaffId);
}

function renderOutlookSchedule(slots, lanes) {
  const rowCount = slots.length;
  const gridRows = slots.map((slot, rowIndex) => {
    const row = rowIndex + 1;
    const isHour = slot.startMinutes % 60 === 0;
    const laneCells = lanes.map((lane, laneIndex) => {
      const isStaffStart = laneIndex === 0 || lanes[laneIndex - 1]?.staffKey !== lane.staffKey;
      const isTimeBlocked = state.timeBlocks.some((block) => (
        slot.startMinutes >= block.startMinutes && slot.startMinutes < block.endMinutes
      ));
      const isCovered = isTimeBlocked || [...lane.appointments, ...lane.manual].some((item) => (
        slot.startMinutes >= item.startMinutes && slot.startMinutes < item.endMinutes
      ));
      return `
        <div class="calendar-lane-cell lane-column-${laneIndex + 1} ${isStaffStart ? "is-staff-start" : "is-staff-continuation"} ${laneIndex === lanes.length - 1 ? "is-last-lane" : ""} ${isCovered ? "is-covered" : "is-open"}" style="grid-column:${laneIndex + 2};grid-row:${row}">
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
    ...lane.appointments.map((item) => renderCalendarEvent(item, lane, laneIndex, "online", rowCount, lanes)),
    ...lane.manual.map((item) => renderCalendarEvent(item, lane, laneIndex, item.serviceId ? "manual" : "blocked", rowCount, lanes)),
  ].join("")).join("");
  const timeBlockEvents = state.timeBlocks.map((block) => renderCalendarTimeBlock(block, rowCount)).join("");
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = els.adminDateInput?.value === toDateInputValue(now)
    && nowMinutes >= state.daySettings.openMinutes && nowMinutes <= state.daySettings.closeMinutes;
  const nowTop = ((nowMinutes - state.daySettings.openMinutes) / SLOT_STEP) * 42;
  return `
    <div class="staff-schedule-body outlook-calendar" style="--calendar-rows:${rowCount}">
      ${gridRows}
      <div class="calendar-grid-end" aria-hidden="true"></div>
      ${eventBlocks}
      ${timeBlockEvents}
      ${showNow ? `<div class="now-line" style="top:${nowTop}px" aria-hidden="true"></div>` : ""}
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
      <details class="service-block-menu lane-menu time-block-menu">
        <summary aria-label="Sperre ${escapeAttribute(`${formatMinutes(block.startMinutes)}-${formatMinutes(block.endMinutes)}`)} verwalten" title="Sperre verwalten">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>
        </summary>
        <div class="service-block-options" role="menu">
          <button type="button" role="menuitem" class="clear-lane-option" data-time-block-delete="${escapeAttribute(block.id)}">Löschen</button>
        </div>
      </details>
    </article>
  `;
}

function renderCalendarEvent(item, lane, laneIndex, kind, rowCount, lanes) {
  const openMinutes = state.daySettings.openMinutes;
  const startRow = Math.max(1, Math.floor((item.startMinutes - openMinutes) / SLOT_STEP) + 1);
  const visibleEnd = Math.min(item.endMinutes, state.daySettings.closeMinutes);
  const rowSpan = Math.max(1, Math.min(rowCount - startRow + 1, Math.ceil((visibleEnd - item.startMinutes) / SLOT_STEP)));
  const service = item.serviceId ? findService(item.serviceId) : null;
  const customerName = kind === "online" ? (item.name || t("admin.unnamedCustomer")) : "";
  const fullLabel = service ? getServiceName(service) : t("admin.blockedSlot");
  const label = service ? getServiceAbbrev(service) : fullLabel;
  const color = service?.slotColor || "#c98f86";
  const menu = kind === "online" || !canEditLane(lane) ? "" : renderSlotMenu({ startMinutes: item.startMinutes, lane: lane.storageKey, item });
  const placement = getStaffEventPlacement(item, lane, laneIndex, lanes);
  return `
    <article
      class="calendar-event ${kind} ${rowSpan === 1 ? "duration-single" : ""} ${service ? "service-colored" : ""}"
      data-slot-start="${item.startMinutes}"
      style="grid-column:${placement.start + 2} / span ${placement.span};grid-row:${startRow} / span ${rowSpan};--slot-color:${escapeAttribute(color)}"
      aria-label="${escapeAttribute(`${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)} ${fullLabel}${customerName ? ` ${customerName}` : ""}`)}"
    >
      <button class="calendar-event-copy event-main" type="button" data-event-detail="${escapeAttribute(item.id || item.scheduleEntryId || "")}" data-event-kind="${kind}">
        <strong>${escapeHtml(label)}</strong>
        <span class="event-meta"><span class="event-time">${escapeHtml(formatMinutes(item.startMinutes))}-${escapeHtml(formatMinutes(item.endMinutes))}</span>${kind === "online" ? `<span class="online-label">Online</span>` : ""}</span>
      </button>
      ${menu}
    </article>
  `;
}

function getStaffEventPlacement(item, lane, laneIndex, lanes) {
  const staffLaneIndexes = lanes.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.staffKey === lane.staffKey);
  if (staffLaneIndexes.length < 2) return { start: laneIndex, span: 1 };
  const conflicts = staffLaneIndexes.some(({ candidate }) => candidate.laneKey !== lane.laneKey
    && [...candidate.appointments, ...candidate.manual].some((other) => hasTimeRangeOverlap(item, [other])));
  return conflicts ? { start: laneIndex, span: 1 } : { start: staffLaneIndexes[0].index, span: staffLaneIndexes.length };
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
    els.upcomingLogTitle.textContent = t("admin.upcomingLog");
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
    els.logCollapseButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${state.logCollapsed ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"}"/></svg>`;
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
  const appointmentLane = state.laneLayout.find((lane) => lane.laneKey === appointment.laneKey);
  const canCancel = state.accessRole !== "staff" || canEditLane(appointmentLane || {});
  return `
    <article class="log-entry ${isCancelled ? "cancelled" : ""}">
      <div class="log-actions">${isCancelled || !canCancel ? "" : `<button class="cancel-log" type="button" data-log-cancel="${appointment.id}" aria-label="Buchung stornieren"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg><span>Stornieren</span></button>`}</div>
      <div class="log-copy">
        <div class="log-primary"><strong>${escapeHtml(appointment.name || t("admin.unnamedCustomer"))}</strong>${appointment.phone ? `<span class="log-phone">${escapeHtml(appointment.phone)}</span>` : ""}</div>
        <span>${escapeHtml(service.name)} · ${escapeHtml(appointment.date)} · ${escapeHtml(formatMinutes(appointment.startMinutes))}</span>
      </div>
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
  return `<article class="admin-slot-card free lane-${lane}" data-slot-start="${startMinutes}"></article>`;
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
  if (!item) return "";
  return `
    <details class="service-block-menu lane-menu">
      <summary aria-label="Terminoptionen" title="Terminoptionen">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>
      </summary>
      <div class="service-block-options" role="menu">
        <button type="button" role="menuitem" class="clear-lane-option" data-lane-action="clear" data-lane="${lane}" data-start="${startMinutes}">Termin löschen</button>
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
    showToast(action === "clear" ? "Der manuelle Termin wurde gelöscht." : "Der Termin wurde aktualisiert.");
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

async function saveManualService(lane, startMinutes, service, existing = null, note = "") {
  if (state.useUnifiedScheduleEntries) {
    const laneConfig = state.laneLayout.find((item) => item.storageKey === lane);
    if (!laneConfig?.staffLaneId) throw new Error("Für diesen Bereich fehlt eine aktive Lane-Konfiguration.");
    await state.repository.createManualScheduleEntry({
      date: els.adminDateInput.value,
      startMinutes,
      serviceId: service.id,
      staffLaneId: laneConfig.staffLaneId,
      replaceEntryId: existing?.scheduleEntryId || null,
      note,
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
      reason: note,
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
  if (state.useUnifiedScheduleEntries) return findCoverageAt(getLaneManualGroups(lane), startMinutes);
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
    showToast(nextBlocked
      ? "Der Tag wurde erfolgreich für neue Buchungen gesperrt."
      : "Der Tag ist wieder für Buchungen freigegeben.");
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
  els.dayBlockButton.textContent = label;
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

function toggleAvailabilityPanel() {
  if (!els.availabilityPanel || !els.availabilityToggle) return;
  const willOpen = els.availabilityPanel.hidden;
  els.availabilityPanel.hidden = !willOpen;
  els.availabilityToggle.setAttribute("aria-expanded", String(willOpen));
  if (!willOpen) closeTimeBlockPanel();
}

function closeAvailabilityPanel() {
  if (!els.availabilityPanel || els.availabilityPanel.hidden) return;
  els.availabilityPanel.hidden = true;
  els.availabilityToggle?.setAttribute("aria-expanded", "false");
  closeTimeBlockPanel();
}

function openManualBookingDialog() {
  if (!els.bookingDialog || !state.isOwner) return;
  const staffGroups = groupLanesByStaff(getVisibleLaneLayout()).filter((group) => (
    state.accessRole !== "staff" || group.lanes.some((lane) => lane.staffId === state.accessStaffId)
  ));
  els.bookingEmployee.innerHTML = staffGroups.map((group) => `<option value="${escapeAttribute(group.key)}">${escapeHtml(group.name)}</option>`).join("");
  const categories = [...new Set(state.services.filter((service) => service.isActive).map((service) => service.category))];
  els.bookingCategory.innerHTML = categories.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(formatServiceCategory(category))}</option>`).join("");
  if (els.bookingNote) els.bookingNote.value = "";
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = "";
  updateManualServiceOptions();
  els.bookingDialog.showModal();
}

function formatServiceCategory(category) {
  return ({ cut: "Schnitt", color: "Farbe", care: "Pflege", shape: "Form" })[category] || category;
}

function updateManualServiceOptions() {
  if (!els.bookingService || !els.bookingCategory) return;
  const services = state.services.filter((service) => service.isActive && service.category === els.bookingCategory.value);
  els.bookingService.innerHTML = services.map((service) => `<option value="${escapeAttribute(service.id)}">${escapeHtml(`${service.name} · ${service.duration} Min.`)}</option>`).join("");
  updateManualBookingTimes();
}

function getSelectedStaffLanes() {
  return state.laneLayout.filter((lane) => lane.staffKey === els.bookingEmployee?.value);
}

function updateManualBookingTimes() {
  if (!els.bookingStart) return;
  const service = findService(els.bookingService?.value);
  const lanes = getSelectedStaffLanes();
  const starts = [];
  for (let minute = state.daySettings.openMinutes; minute + service.duration <= state.daySettings.closeMinutes; minute += SLOT_STEP) {
    if (state.timeBlocks.some((block) => minute < block.endMinutes && minute + service.duration > block.startMinutes)) continue;
    if (lanes.some((lane) => canPlaceManualService(service, minute, lane.storageKey))) starts.push(minute);
  }
  els.bookingStart.innerHTML = starts.length
    ? starts.map((minute) => `<option value="${minute}">${escapeHtml(formatMinutes(minute))}</option>`).join("")
    : `<option value="">Keine freie Uhrzeit</option>`;
  els.bookingStart.disabled = starts.length === 0;
  const submit = els.manualBookingForm?.querySelector('[type="submit"]');
  if (submit) submit.disabled = starts.length === 0;
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = starts.length ? "" : "Für diesen Service ist bei diesem Mitarbeiter keine Startzeit frei.";
}

async function submitManualBooking(event) {
  event.preventDefault();
  const service = findService(els.bookingService.value);
  const startMinutes = Number(els.bookingStart.value);
  const lane = getSelectedStaffLanes().find((candidate) => canPlaceManualService(service, startMinutes, candidate.storageKey));
  if (!lane) {
    els.bookingFormMessage.textContent = "Die gewählte Uhrzeit ist nicht mehr frei.";
    updateManualBookingTimes();
    return;
  }
  const submit = els.manualBookingForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await saveManualService(lane.storageKey, startMinutes, service, null, els.bookingNote?.value.trim() || "");
    els.bookingDialog.close();
    await refreshDateOptions();
    await refreshDayData();
    showToast(`${service.name} um ${formatMinutes(startMinutes)} wurde für ${lane.staffName} eingetragen.`);
  } catch (error) {
    els.bookingFormMessage.textContent = "";
    showToast(`Termin konnte nicht gespeichert werden: ${error.message}`, "error");
  } finally {
    submit.disabled = false;
  }
}

function openScheduleDetail(id, kind) {
  if (!els.detailDialog || !id) return;
  const item = kind === "online"
    ? state.appointments.find((entry) => String(entry.id) === id)
    : state.manualEntries.find((entry) => String(entry.id || entry.scheduleEntryId) === id);
  if (!item) return;
  const service = findService(item.serviceId);
  const lane = state.laneLayout.find((entry) => entry.laneKey === item.laneKey);
  const rows = [
    ["Service", service.name],
    ["Datum", formatLogDate(item.date || els.adminDateInput.value)],
    ["Uhrzeit", `${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)}`],
    ["Mitarbeiter", lane?.staffName || ""],
    kind === "online" ? ["Kunde", item.name || ""] : ["Notiz", item.note || item.reason || ""],
    kind === "online" ? ["Telefon", item.phone || ""] : null,
    kind === "online" ? ["E-Mail", item.email || ""] : null,
  ].filter((row) => row && row[1]);
  els.detailTitle.textContent = service.name;
  els.detailList.innerHTML = rows.map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  els.detailDialog.showModal();
}

function renderTimeBlockControls() {
  if (!els.timeBlockStart || !els.timeBlockEnd || !els.timeBlockAction || !els.timeBlockToggle) return;
  const { openMinutes, closeMinutes, isBlockedDay } = state.daySettings;
  const date = els.adminDateInput?.value;
  const signature = `${date}:${openMinutes}:${closeMinutes}:${state.timeBlocks.map((block) => `${block.id}:${block.startMinutes}-${block.endMinutes}`).join(",")}`;
  if (els.timeBlockPanel?.dataset.signature !== signature) {
    const sameDate = els.timeBlockPanel?.dataset.date === date;
    const preferredStart = sameDate && els.timeBlockStart.value ? Number(els.timeBlockStart.value) : openMinutes;
    els.timeBlockStart.innerHTML = buildTimeOptions(openMinutes, closeMinutes - SLOT_STEP);
    els.timeBlockEnd.innerHTML = buildTimeOptions(openMinutes + SLOT_STEP, closeMinutes);
    const nextRange = findAvailableTimeBlockRange(preferredStart, openMinutes, closeMinutes);
    els.timeBlockStart.value = String(nextRange?.startMinutes ?? openMinutes);
    els.timeBlockEnd.value = String(nextRange?.endMinutes ?? Math.min(closeMinutes, openMinutes + SLOT_STEP));
    if (els.timeBlockPanel) {
      els.timeBlockPanel.dataset.signature = signature;
      els.timeBlockPanel.dataset.date = date;
    }
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
  const overlapsAnotherBlock = state.timeBlocks.some((block) => (
    selectedStart < block.endMinutes && selectedEnd > block.startMinutes
  ));
  els.timeBlockToggle.disabled = isBlockedDay;
  els.timeBlockAction.disabled = isBlockedDay || overlapsAnotherBlock || selectedEnd <= selectedStart;
  if (els.timeBlockHint) {
    els.timeBlockHint.textContent = isBlockedDay
      ? "Der gesamte Tag ist bereits blockiert."
      : overlapsAnotherBlock
      ? "Die Auswahl überschneidet eine bestehende Sperre."
        : "";
  }
  if (els.existingTimeBlocks) {
    els.existingTimeBlocks.innerHTML = state.timeBlocks.map((block) => `
      <div class="existing-block">
        <span>${escapeHtml(formatMinutes(block.startMinutes))}-${escapeHtml(formatMinutes(block.endMinutes))}</span>
        <button type="button" data-unblock-time="${escapeAttribute(block.id)}" aria-label="${escapeAttribute(`${formatMinutes(block.startMinutes)} bis ${formatMinutes(block.endMinutes)} freigeben`)}">Freigeben</button>
      </div>
    `).join("");
  }
}

function renderAvailabilityStaffOptions() {
  if (!els.availabilityStaff) return;
  const groups = groupLanesByStaff(state.laneLayout);
  if (state.visibleStaffKey !== "all" && !groups.some((group) => group.key === state.visibleStaffKey)) {
    state.visibleStaffKey = "all";
  }
  els.availabilityStaff.innerHTML = [
    '<option value="all">Alle Mitarbeiter</option>',
    ...groups.map((group) => `<option value="${escapeAttribute(group.key)}">${escapeHtml(group.name)}</option>`),
  ].join("");
  els.availabilityStaff.value = state.visibleStaffKey;
  els.availabilityToggle?.classList.toggle("is-filtered", state.visibleStaffKey !== "all");
}

function findAvailableTimeBlockRange(preferredStart, openMinutes, closeMinutes) {
  const starts = [];
  for (let start = openMinutes; start + SLOT_STEP <= closeMinutes; start += SLOT_STEP) starts.push(start);
  const ordered = [...starts.filter((start) => start >= preferredStart), ...starts.filter((start) => start < preferredStart)];
  for (const startMinutes of ordered) {
    for (const duration of [60, SLOT_STEP]) {
      const endMinutes = startMinutes + duration;
      if (endMinutes <= closeMinutes && !state.timeBlocks.some((block) => startMinutes < block.endMinutes && endMinutes > block.startMinutes)) {
        return { startMinutes, endMinutes };
      }
    }
  }
  return null;
}

function buildTimeOptions(startMinutes, endMinutes) {
  const options = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += SLOT_STEP) {
    options.push(`<option value="${minutes}">${escapeHtml(formatMinutes(minutes))}</option>`);
  }
  return options.join("");
}

async function handleCreateTimeBlock() {
  const startMinutes = Number(els.timeBlockStart?.value);
  const endMinutes = Number(els.timeBlockEnd?.value);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return;
  if (state.timeBlocks.some((block) => startMinutes < block.endMinutes && endMinutes > block.startMinutes)) return;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Uhrzeit blockieren",
    message: `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} für neue Buchungen blockieren?`,
    confirmLabel: "Blockieren",
    tone: "danger",
  });
  if (!confirmed) return;

  els.timeBlockAction.disabled = true;
  try {
    await state.repository.createTimeBlock({
      date: els.adminDateInput.value,
      startMinutes,
      endMinutes,
    });
    await refreshDateOptions();
    await refreshDayData();
    closeTimeBlockPanel();
    showToast(`${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} wurde erfolgreich blockiert.`);
  } catch (error) {
    await showAvailabilityError(error, "Die Uhrzeit konnte nicht blockiert werden.");
  } finally {
    renderTimeBlockControls();
  }
}

async function deleteTimeBlockById(blockId) {
  const block = state.timeBlocks.find((item) => item.id === blockId);
  if (!block) return;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Sperre löschen",
    message: `${formatMinutes(block.startMinutes)}-${formatMinutes(block.endMinutes)} wirklich freigeben?`,
    confirmLabel: "Löschen",
    tone: "danger",
  });
  if (!confirmed) return;
  try {
    await state.repository.deleteTimeBlock(block.id);
    await refreshDateOptions();
    await refreshDayData();
    showToast(`${formatMinutes(block.startMinutes)}-${formatMinutes(block.endMinutes)} ist wieder buchbar.`);
  } catch (error) {
    await showAvailabilityError(error, "Die Sperre konnte nicht gelöscht werden.");
  }
}

async function showAvailabilityError(error, fallbackMessage) {
  const message = String(error?.message || "");
  const occupied = message.includes("OCCUPIED_SLOTS_PRESENT");
  showToast(occupied
    ? "In diesem Zeitraum liegen bereits belegte Arbeitszeiten. Verschiebe oder storniere die betroffenen Termine und versuche es erneut."
    : fallbackMessage, "error");
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
        .select("id, lane_key, label, sort_order, salon_staff!inner(id, staff_key, name, sort_order, is_active)")
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
        staffId: row.salon_staff?.id,
        staffName: row.salon_staff?.name,
        staffSortOrder: row.salon_staff?.sort_order,
      })).sort((left, right) => (
        Number(left.staffSortOrder || 0) - Number(right.staffSortOrder || 0)
        || Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      ));
    },
    async listManualScheduleEntries(date) {
      const salon = await salonPromise;
      let { data, error } = await client
        .from("schedule_entries")
        .select("id, service_id, entry_source, schedule_date, covered_start, covered_end, occupied_slots, note, staff_lanes!inner(lane_key)")
        .eq("salon_id", salon.id)
        .eq("schedule_date", date)
        .eq("status", "active")
        .neq("entry_source", "online")
        .order("covered_start", { ascending: true });
      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("schedule_entries")
          .select("id, service_id, entry_source, schedule_date, covered_start, covered_end, occupied_slots, staff_lanes!inner(lane_key)")
          .eq("salon_id", salon.id)
          .eq("schedule_date", date)
          .eq("status", "active")
          .neq("entry_source", "online")
          .order("covered_start", { ascending: true }));
      }
      if (error && isMissingUnifiedSchedule(error)) return null;
      if (error) throw error;
      return (data || []).map(fromSupabaseScheduleEntry);
    },
    async createManualScheduleEntry(entry) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("create_admin_schedule_entry", {
        p_salon_id: salon.id,
        p_staff_lane_id: entry.staffLaneId,
        p_schedule_date: entry.date,
        p_start_time: `${formatMinutes(entry.startMinutes)}:00`,
        p_service_id: entry.serviceId || null,
        p_replace_entry_id: entry.replaceEntryId || null,
      });
      if (error) throw error;
      if (entry.note && data) {
        const { error: noteError } = await client.from("schedule_entries").update({ note: entry.note }).eq("id", data);
        if (noteError) throw noteError;
      }
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
        .select("salon_id, role, staff_id")
        .eq("user_id", userId);
      if (error) throw error;
      const memberships = data || [];
      const admin = memberships.find((membership) => ["admin", "super_admin"].includes(membership.role));
      if (admin) return { allowed: true, role: "admin", staffId: null };
      const salonMembership = memberships.find((membership) => membership.salon_id === salon.id);
      return {
        allowed: Boolean(salonMembership),
        role: salonMembership?.role || null,
        staffId: salonMembership?.staff_id || null,
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
  const queryStaffCount = Number(new URLSearchParams(window.location.search).get("staff"));
  const configuredLaneCount = Number(window.OPENSLOT_DEMO_LANE_COUNT || (Number.isInteger(queryStaffCount) ? queryStaffCount * 2 : 0));
  const laneCount = Number.isInteger(configuredLaneCount)
    && configuredLaneCount > 0
    ? Math.max(2, Math.min(configuredLaneCount, 26))
    : (getCurrentSalonSlug() === "liyong" ? 2 : 4);
  return Array.from({ length: laneCount }, (_, index) => ({
    ...createLaneDefinition(String.fromCharCode(97 + index), index + 1),
    staffKey: `staff-${Math.floor(index / 2) + 1}`,
    staffName: `M${Math.floor(index / 2) + 1}`,
    staffId: `demo-staff-${Math.floor(index / 2) + 1}`,
  }));
}

function normalizeLaneLayout(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return createDefaultLaneLayout();
  const normalized = rows
    .filter((row) => String(row.laneKey || "").trim())
    .map((row) => {
      const laneKey = String(row.laneKey).toLowerCase();
      const fallbackSortOrder = Number(row.sortOrder) || 1;
      const legacy = LEGACY_LANE_DEFINITIONS.find((lane) => lane.laneKey === laneKey)
        || createLaneDefinition(laneKey, fallbackSortOrder);
      return {
        ...legacy,
        staffLaneId: row.staffLaneId || null,
        label: row.label || legacy.label,
        sortOrder: Number(row.sortOrder ?? legacy.sortOrder),
        staffId: row.staffId || null,
        staffKey: row.staffKey || "default",
        staffName: row.staffName || "Mitarbeiter 1",
        staffSortOrder: Number(row.staffSortOrder || 0),
      };
    })
    .sort((left, right) => (
      left.staffSortOrder - right.staffSortOrder
      || left.sortOrder - right.sortOrder
    ));
  return normalized.length > 0 ? normalized : createDefaultLaneLayout();
}

function createLaneDefinition(laneKey, sortOrder) {
  const key = String(laneKey).toLowerCase();
  return {
    laneKey: key,
    storageKey: LEGACY_LANE_DEFINITIONS.find((lane) => lane.laneKey === key)?.storageKey || `lane-${key}`,
    label: key.toUpperCase(),
    sortOrder,
  };
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
  const laneConfig = state.laneLayout.find((item) => item.storageKey === lane);
  if (!laneConfig) return [];
  return allocateAppointmentsByLane(state.appointments.filter((item) => item.status !== "cancelled"), state.laneLayout).get(laneConfig.laneKey) || [];
}

function getLaneManualGroups(lane) {
  if (state.useUnifiedScheduleEntries) {
    const laneConfig = state.laneLayout.find((item) => item.storageKey === lane);
    return state.manualEntries.filter((item) => item.laneKey === laneConfig?.laneKey);
  }
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
    note: row.note || "",
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
