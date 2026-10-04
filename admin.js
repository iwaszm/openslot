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
const ADMIN_SLOT_HEIGHT = 58;
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
const STAFF_VIEW_KEY = `${LOCAL_STORAGE_NAMESPACE}.admin-staff-view`;
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
  logCollapsed: true,
  repository: null,
  services: DEFAULT_SERVICES,
  salon: null,
  laneLayout: createDefaultLaneLayout(),
  staffServiceKeys: null,
  useUnifiedScheduleEntries: false,
  datePageStart: 0,
  showAllStaff: true,
  selectedVisibleStaffKeys: new Set(),
  staffViewIdentity: null,
};
let liveRefreshInFlight = false;
let lastDateOptionsRefresh = 0;
let pendingDayRender = false;
let dayRefreshSequence = 0;
let logRefreshSequence = 0;
let dateOptionsRefreshSequence = 0;
let toastTimeout = null;

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
const getAdminLocale = () => ({ zh: "zh-CN", en: "en-GB", de: "de-DE" })[window.OpenSlotI18n?.language] || "de-DE";
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
  settingsLink: document.querySelector("#settingsLink"),
  adminShopName: document.querySelector("#adminShopName"),
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
  showAllStaff: document.querySelector("#showAllStaff"),
  visibleStaffOptions: document.querySelector("#visibleStaffOptions"),
  staffVisibilityHint: document.querySelector("#staffVisibilityHint"),
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
  detailActions: document.querySelector("#detailActions"),
  detailDelete: document.querySelector("#detailDelete"),
  actionToast: document.querySelector("#actionToast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastClose: document.querySelector("#toastClose"),
};

function translateStaticAdminUi() {
  const setText = (selector, key) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = t(key);
  };
  const setLeadingText = (selector, key) => {
    const node = document.querySelector(selector);
    const textNode = node?.firstChild;
    if (textNode?.nodeType === Node.TEXT_NODE) textNode.nodeValue = t(key);
  };
  const setLabel = (selector, key) => {
    const node = document.querySelector(selector);
    if (!node) return;
    const value = t(key);
    node.setAttribute("aria-label", value);
    if (node.hasAttribute("title")) node.setAttribute("title", value);
  };
  setText("#upcomingLogTitle", "admin.bookingLog");
  setText("#adminOfflineNotice", "admin.offline");
  setText("#adminSyncNotice", "admin.syncFailed");
  setText("#bookingDialogTitle", "admin.addAppointment");
  setText("#ownerLoginForm .login-button", "admin.loginShort");
  setText("#availabilityPanel > strong", "admin.availability");
  setText("#timeBlockToggle", "admin.blockTime");
  setLeadingText("label:has(#timeBlockStart)", "admin.from");
  setLeadingText("label:has(#timeBlockEnd)", "admin.until");
  setText("#timeBlockAction", "admin.block");
  setLeadingText("label:has(#bookingEmployee)", "admin.employee");
  setLeadingText("label:has(#bookingCategory)", "admin.category");
  setLeadingText("label:has(#bookingService)", "admin.service");
  setLeadingText("label:has(#bookingStart)", "admin.begin");
  setLeadingText("label:has(#bookingNote)", "admin.note");
  document.querySelector("#bookingNote")?.setAttribute("placeholder", t("admin.optional"));
  setText("#manualBookingForm .text-button", "admin.cancel");
  setText("#manualBookingForm .solid-button", "admin.saveAppointment");
  setLabel("#availabilityToggle", "admin.manageAvailability");
  setLabel("#addBookingButton", "admin.addAppointment");
  setLabel("#ownerLogoutButton", "admin.logout");
  setLabel("#pushToggleButton", "admin.enableNotifications");
  setLabel("#logCollapseButton", "admin.collapseLog");
  setLabel("#toastClose", "admin.close");
  document.querySelectorAll("[data-close-admin-dialog]").forEach((button) => button.setAttribute("aria-label", t("admin.close")));
}

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
  translateStaticAdminUi();
  if (els.adminDateInput) {
    els.adminDateInput.value = toDateInputValue(new Date());
    els.adminDateInput.min = toDateInputValue(new Date());
    els.adminDateInput.max = buildDateRange().at(-1);
  }
  state.repository = createRepository();
  bindEvents();
  await initializeAuth();
  await refreshServices();
  await refreshLaneLayout();
  await refreshStaffServices();
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
      els.adminDateInput.max = buildDateRange().at(-1);
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
  els.adminDateInput?.addEventListener("change", async () => {
    const selectedIndex = state.dateOptions.findIndex((option) => option.date === els.adminDateInput.value);
    if (selectedIndex >= 0) state.datePageStart = getCalendarPageStart(selectedIndex);
    renderDateStrip();
    await Promise.all([
      refreshDateOptions(),
      refreshDayData({ showLoading: true }),
    ]);
  });
  els.adminDatePrevButton?.addEventListener("click", () => changeDatePage(-1));
  els.adminDateNextButton?.addEventListener("click", () => changeDatePage(1));
  els.todayButton?.addEventListener("click", selectToday);
  els.availabilityToggle?.addEventListener("click", toggleAvailabilityPanel);
  els.showAllStaff?.addEventListener("change", () => {
    state.showAllStaff = els.showAllStaff.checked;
    if (!state.showAllStaff && state.selectedVisibleStaffKeys.size === 0) {
      const groups = groupLanesByStaff(state.laneLayout);
      const preferred = state.accessRole === "staff"
        ? groups.find((group) => group.staffId === state.accessStaffId)
        : groups[0];
      if (preferred) state.selectedVisibleStaffKeys.add(preferred.key);
    }
    saveStaffViewPreference();
    renderSlotManager();
  });
  els.visibleStaffOptions?.addEventListener("change", handleVisibleStaffChange);
  els.addBookingButton?.addEventListener("click", openManualBookingDialog);
  els.manualBookingForm?.addEventListener("submit", submitManualBooking);
  els.bookingEmployee?.addEventListener("change", updateManualServiceOptions);
  els.bookingCategory?.addEventListener("change", updateManualServiceOptions);
  els.bookingService?.addEventListener("change", updateManualBookingTimes);
  els.detailDelete?.addEventListener("click", deleteSelectedManualEntry);
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
    translateStaticAdminUi();
    render();
  });
  window.addEventListener("resize", () => renderSlotManager());
}

function createRepository() {
  const config = window.OPENSLOT_SUPABASE || {};
  const forcedLocal = window.OPENSLOT_RUNTIME?.dataSource === "local";
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isLocalPreview = isLocalHost && new URLSearchParams(window.location.search).has("demo");
  const hasSupabase = !isLocalPreview && Boolean(window.supabase && config.url && config.anonKey);
  if (forcedLocal || !hasSupabase) {
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
    await refreshStaffServices();
    await refreshDateOptions();
    await refreshDayData();
    await refreshUpcomingLog();
  });
}

async function applyAuthState(user) {
  state.isOwner = false;
  state.accessRole = null;
  state.accessStaffId = null;
  state.staffViewIdentity = null;

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
    state.laneLayout = state.repository.authSupported ? [] : createDefaultLaneLayout();
  }
  const validStaffKeys = new Set(groupLanesByStaff(state.laneLayout).map((group) => group.key));
  state.selectedVisibleStaffKeys = new Set([...state.selectedVisibleStaffKeys].filter((key) => validStaffKeys.has(key)));
  initializeStaffViewPreference();
}

async function refreshStaffServices() {
  try {
    const assignments = await state.repository.listStaffServices?.();
    state.staffServiceKeys = Array.isArray(assignments)
      ? new Set(assignments.map((item) => `${item.staffKey}:${item.serviceId}`))
      : null;
  } catch (_error) {
    state.staffServiceKeys = null;
  }
}

async function loadManualSchedule(date) {
  const unifiedEntries = await state.repository.listManualScheduleEntries(date);
  if (Array.isArray(unifiedEntries)) {
    return { ...splitManualScheduleEntries(unifiedEntries), isUnified: true };
  }
  if (state.repository.authSupported) {
    throw new Error("Unified schedule entries are unavailable");
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
  const existing = new Map(state.dateOptions.map((option) => [option.date, option]));
  const visibleDates = dates.slice(state.datePageStart, state.datePageStart + 7);
  const requestedDates = [...new Set([...visibleDates, els.adminDateInput.value])].filter((date) => dates.includes(date));
  const requestId = ++dateOptionsRefreshSequence;
  try {
    const summaries = await Promise.all(requestedDates.map(async (date) => {
      const [appointments, daySettings, manualSchedule, timeBlocks] = await Promise.all([
        state.repository.listAppointments(date),
        state.repository.getDaySettings(date),
        loadManualSchedule(date),
        state.repository.listTimeBlocks(date),
      ]);
      const manualEntries = manualSchedule.allEntries || [
        ...manualSchedule.blockedSlots.map((item) => ({ ...item, laneKey: item.laneKey || "a" })),
        ...groupStaffOverrides(manualSchedule.overflowSlots).map((item) => ({ ...item, laneKey: item.laneKey || "b" })),
        ...groupStaffOverrides(manualSchedule.flexibleSlots).map((item) => ({ ...item, laneKey: item.laneKey || "c" })),
      ];
      const load = calculateScheduleLoad(appointments, manualEntries, daySettings, timeBlocks);
      return {
        date,
        occupiedSlotCount: load.occupiedSlotCount,
        totalSlotCount: load.totalSlotCount,
        blockedCount: manualSchedule.blockedSlots.filter((item) => !item.serviceId).length,
        isBlockedDay: daySettings.isBlockedDay,
        holidayName: daySettings.holidayName || "",
        isPublicHoliday: Boolean(daySettings.isPublicHoliday),
        isBusinessDay: isScheduledBusinessDay(date),
      };
    }));
    if (requestId !== dateOptionsRefreshSequence || (!state.isOwner && state.repository.authSupported)) return true;
    const loaded = new Map(summaries.map((option) => [option.date, option]));
    state.dateOptions = dates.map((date) => loaded.get(date) || existing.get(date) || createEmptyDateOption(date));
    lastDateOptionsRefresh = Date.now();
  } catch (error) {
    if (requestId !== dateOptionsRefreshSequence) return true;
    if (keepOnError) {
      console.warn("Calendar refresh failed:", error);
      return false;
    }
    state.dateOptions = dates.map((date) => existing.get(date) || createEmptyDateOption(date));
  }
  renderDateStrip();
  return true;
}

function createEmptyDateOption(date) {
  const settings = createDefaultDaySettings(date);
  return {
    date,
    occupiedSlotCount: 0,
    totalSlotCount: countScheduleCapacity(settings),
    blockedCount: 0,
    isBlockedDay: settings.isBlockedDay,
    holidayName: settings.holidayName || "",
    isPublicHoliday: Boolean(settings.isPublicHoliday),
    isBusinessDay: isScheduledBusinessDay(date),
  };
}

async function refreshDayData({ onlyIfChanged = false, showLoading = false } = {}) {
  if (!els.adminDateInput || !els.appointmentList) return;
  if (!state.isOwner && state.repository.authSupported) return;
  const requestId = ++dayRefreshSequence;
  if (showLoading) setDayLoading(true);
  try {
    const date = els.adminDateInput.value;
    const snapshot = await state.repository.getDaySnapshot?.(date);
    const [appointments, daySettings, manualSchedule, timeBlocks] = snapshot
      ? [snapshot.appointments, snapshot.daySettings, snapshot.manualSchedule, snapshot.timeBlocks]
      : await Promise.all([
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
  } finally {
    if (showLoading && requestId === dayRefreshSequence) setDayLoading(false);
  }
  return true;
}

function setDayLoading(isLoading) {
  const container = els.appointmentList?.closest(".schedule-scroll");
  container?.classList.toggle("is-loading", isLoading);
  els.appointmentList?.setAttribute("aria-busy", String(isLoading));
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
  applyShopProfile();
  renderOwnerControls();
  renderDateStrip();
  renderSlotManager();
  renderUpcomingLog();
  renderCollapseState();
}

function applyShopProfile() {
  if (!state.salon) return;
  if (els.adminShopName) els.adminShopName.textContent = state.salon.name || "OpenSlot";
  document.title = `${state.salon.name || "OpenSlot"} · Tagesplan`;
  document.documentElement.dataset.shopTheme = state.salon.theme_preset || "lime";
}

function renderAuthState(user = null, message = "") {
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (els.settingsLink) els.settingsLink.hidden = !state.isOwner;
  if (!state.isOwner && els.adminSyncNotice) els.adminSyncNotice.hidden = true;
  if (els.ownerLoginForm) els.ownerLoginForm.hidden = Boolean(user);
  if (els.ownerSession) els.ownerSession.hidden = !user;
  if (els.ownerEmailLabel) els.ownerEmailLabel.textContent = user?.email || "";
  if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = message;
}

function renderOwnerControls() {
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (!state.isOwner) return;
  if (els.availabilityToggle) els.availabilityToggle.hidden = false;
}

function renderDateStrip() {
  if (!els.adminDateStrip || state.dateOptions.length === 0) return;
  const selectedDate = new Date(`${els.adminDateInput.value}T00:00:00`);
  if (els.calendarMonth) {
    els.calendarMonth.textContent = new Intl.DateTimeFormat(getAdminLocale(), { month: "long" }).format(selectedDate);
  }
  const selectedIndex = Math.max(0, state.dateOptions.findIndex((option) => option.date === els.adminDateInput.value));
  if (selectedIndex < state.datePageStart || selectedIndex >= state.datePageStart + 7) {
    state.datePageStart = getCalendarPageStart(selectedIndex);
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
      <button class="mini-day ${isSelected ? "selected" : ""} ${option.isBlockedDay ? "blocked" : ""}" type="button" data-date="${option.date}" aria-pressed="${isSelected}" ${option.holidayName ? `title="${escapeAttribute(option.holidayName)}"` : ""} ${isSelectable ? "" : "disabled"}>
        <span class="date-weekday">${escapeHtml(label.weekday)}</span>
        <strong>${escapeHtml(label.day)}</strong>
        ${isSelectable && !option.isBlockedDay ? `<span class="day-status-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>` : ""}
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
      renderDateStrip();
      await refreshDayData({ showLoading: true });
    });
  });
}

function getCalendarPageStart(selectedIndex) {
  if (selectedIndex <= 0) return 0;
  const firstMondayIndex = state.dateOptions.findIndex((option, index) => (
    index > 0 && new Date(`${option.date}T00:00:00`).getDay() === 1
  ));
  if (firstMondayIndex < 0 || selectedIndex < firstMondayIndex) return 0;
  return firstMondayIndex + Math.floor((selectedIndex - firstMondayIndex) / 7) * 7;
}

async function changeDatePage(direction) {
  const current = state.dateOptions[state.datePageStart]?.date || toDateInputValue(new Date());
  const targetDate = direction > 0
    ? nextMondayDate(current)
    : previousCalendarPageDate(current);
  const nextStart = Math.max(0, state.dateOptions.findIndex((option) => option.date === targetDate));
  if (nextStart === state.datePageStart) return;
  state.datePageStart = nextStart;
  const target = state.dateOptions[nextStart];
  if (target) {
    els.adminDateInput.value = target.date;
    renderDateStrip();
    await Promise.all([
      refreshDateOptions(),
      refreshDayData({ showLoading: true }),
    ]);
  }
}

async function selectToday() {
  const today = toDateInputValue(new Date());
  state.datePageStart = 0;
  els.adminDateInput.value = today;
  renderDateStrip();
  await Promise.all([
    refreshDateOptions(),
    refreshDayData({ showLoading: true }),
  ]);
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
  const groups = getVisibleStaffGroups();
  return groups.flatMap((group) => group.lanes.slice(0, 2));
}

function getVisibleStaffGroups() {
  const limit = window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches ? 2 : 4;
  const groups = groupLanesByStaff(state.laneLayout);
  const selected = state.showAllStaff
    ? groups
    : groups.filter((group) => state.selectedVisibleStaffKeys.has(group.key));
  return selected.slice(0, limit);
}

function handleVisibleStaffChange(event) {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  const wasShowingAll = state.showAllStaff;
  state.showAllStaff = false;
  if (els.showAllStaff) els.showAllStaff.checked = false;
  if (wasShowingAll) {
    state.selectedVisibleStaffKeys = new Set([input.value]);
    input.checked = true;
  } else if (input.checked) {
    const limit = window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches ? 2 : 4;
    if (state.selectedVisibleStaffKeys.size >= limit) {
      input.checked = false;
      showToast(`In dieser Ansicht können maximal ${limit} Mitarbeiter angezeigt werden.`, "error");
      return;
    }
    state.selectedVisibleStaffKeys.add(input.value);
  } else {
    state.selectedVisibleStaffKeys.delete(input.value);
    if (state.selectedVisibleStaffKeys.size === 0) {
      input.checked = true;
      state.selectedVisibleStaffKeys.add(input.value);
      showToast("Mindestens ein Mitarbeiter muss sichtbar bleiben.", "error");
      return;
    }
  }
  saveStaffViewPreference();
  renderSlotManager();
}

function getStaffViewIdentity() {
  return state.accessRole === "staff" && state.accessStaffId
    ? `staff:${state.accessStaffId}`
    : `role:${state.accessRole || "preview"}`;
}

function readStaffViewPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(STAFF_VIEW_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_error) {
    return {};
  }
}

function initializeStaffViewPreference() {
  const groups = groupLanesByStaff(state.laneLayout);
  const identity = getStaffViewIdentity();
  const validKeys = new Set(groups.map((group) => group.key));
  if (state.staffViewIdentity === identity) {
    state.selectedVisibleStaffKeys = new Set([...state.selectedVisibleStaffKeys].filter((key) => validKeys.has(key)));
    return;
  }

  const saved = readStaffViewPreferences()[identity];
  const savedKeys = Array.isArray(saved?.staffKeys) ? saved.staffKeys.filter((key) => validKeys.has(key)) : [];
  if (saved && (saved.showAll === true || savedKeys.length > 0)) {
    state.showAllStaff = saved.showAll === true;
    state.selectedVisibleStaffKeys = new Set(savedKeys);
  } else if (state.accessRole === "staff") {
    const own = groups.find((group) => group.staffId === state.accessStaffId);
    state.showAllStaff = false;
    state.selectedVisibleStaffKeys = new Set(own ? [own.key] : groups[0] ? [groups[0].key] : []);
  } else {
    state.showAllStaff = true;
    state.selectedVisibleStaffKeys = new Set();
  }
  state.staffViewIdentity = identity;
}

function saveStaffViewPreference() {
  const identity = getStaffViewIdentity();
  const preferences = readStaffViewPreferences();
  preferences[identity] = {
    showAll: state.showAllStaff,
    staffKeys: [...state.selectedVisibleStaffKeys],
  };
  try {
    localStorage.setItem(STAFF_VIEW_KEY, JSON.stringify(preferences));
  } catch (_error) {
    // The selected view still works for the current session if storage is unavailable.
  }
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
  els.appointmentList.innerHTML = renderOutlookSchedule(slots, lanes);
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
  const weekday = new Intl.DateTimeFormat(getAdminLocale(), { weekday: "short" }).format(date).replace(/\.$/, "");
  return `${month}, ${String(date.getDate()).padStart(2, "0")}, ${weekday}. (${count})`;
}

function groupLanesByStaff(lanes) {
  const groups = [];
  lanes.forEach((lane, index) => {
    const previous = groups.at(-1);
    if (previous?.key === lane.staffKey) previous.lanes.push(lane);
    else groups.push({
      key: lane.staffKey,
      name: lane.staffShortName || lane.staffName,
      fullName: lane.staffName,
      color: lane.staffColor || "#d7ef57",
      staffId: lane.staffId || null,
      start: index,
      lanes: [lane],
    });
  });
  return groups;
}

function canEditLane(lane) {
  return state.accessRole !== "staff" || (state.accessStaffId && lane.staffId === state.accessStaffId);
}

function renderOutlookSchedule(slots, lanes) {
  const staffGroups = groupLanesByStaff(lanes);
  const allEvents = lanes.flatMap((lane) => [...lane.appointments, ...lane.manual]);
  const positions = [0];
  slots.forEach((slot) => {
    const busy = allEvents.some((item) => item.startMinutes < slot.startMinutes + SLOT_STEP && item.endMinutes > slot.startMinutes);
    positions.push(positions.at(-1) + (busy ? 62 : 34));
  });
  const openMinutes = state.daySettings.openMinutes;
  const closeMinutes = state.daySettings.closeMinutes;
  const at = (minute) => {
    if (positions.length === 1) return 0;
    const clamped = Math.max(openMinutes, Math.min(closeMinutes, minute));
    const index = Math.min(positions.length - 2, Math.floor((clamped - openMinutes) / SLOT_STEP));
    const fraction = (clamped - openMinutes - index * SLOT_STEP) / SLOT_STEP;
    return positions[index] + (positions[index + 1] - positions[index]) * fraction;
  };
  const totalHeight = positions.at(-1) || 0;
  const hours = [];
  for (let minute = openMinutes; minute <= closeMinutes; minute += 60) {
    hours.push(`<div class="hour-label" style="top:${at(minute)}px">${escapeHtml(String(Math.floor(minute / 60)).padStart(2, "0"))}</div>`);
  }
  const rows = slots.map((slot, index) => `<div class="time-row ${slot.startMinutes % 60 === 0 ? "hour-row" : "half-row"}" style="top:${positions[index]}px;height:${positions[index + 1] - positions[index]}px"></div>`).join("");
  const staffMarkup = staffGroups.map((group) => {
    const staffEvents = group.lanes.flatMap((lane, laneIndex) => [
      ...lane.appointments.map((item) => ({ ...item, laneIndex, kind: "online", lane })),
      ...lane.manual.map((item) => ({ ...item, laneIndex, kind: item.serviceId ? "manual" : "blocked", lane })),
    ]).sort((left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes);
    const scopedBlocks = state.timeBlocks.filter((block) => !block.staffId || block.staffId === group.staffId);
    const shades = state.daySettings.isBlockedDay
      ? `<div class="availability-shade" style="top:0;height:${totalHeight}px"></div>`
      : scopedBlocks.map((block) => `<div class="availability-shade" style="top:${at(block.startMinutes)}px;height:${Math.max(1, at(block.endMinutes) - at(block.startMinutes))}px"></div>`).join("");
    const blockMarkup = state.daySettings.isBlockedDay
      ? `<article class="calendar-block day-block" style="top:0;height:${totalHeight}px"><div class="block-heading"><strong>Tag blockiert</strong></div></article>`
      : scopedBlocks.map((block) => renderStaffTimeBlock(block, at, group)).join("");
    const eventMarkup = staffEvents.map((event) => renderStaffCalendarEvent(event, staffEvents, at)).join("");
    const editable = group.lanes.some(canEditLane);
    return `<section class="staff-column ${editable ? "is-editable" : "is-readonly"}" aria-label="${escapeAttribute(group.name)}${editable ? "" : ", nur lesen"}"><div class="staff-name"><span class="staff-avatar" style="--staff-color:${escapeAttribute(group.color)}">${escapeHtml(String(group.name || "M").slice(0, 2))}</span><strong>${escapeHtml(group.name)}</strong>${editable ? "" : `<span class="readonly-label">Nur lesen</span>`}</div><div class="staff-timeline" style="height:${totalHeight}px">${shades}${rows}${blockMarkup}${eventMarkup}${renderNowLine(at)}</div></section>`;
  }).join("");
  return `<div class="time-gutter"><div class="gutter-heading"></div><div class="time-labels" style="height:${totalHeight}px">${hours.join("")}</div></div><div class="staff-columns ${staffGroups.length === 1 ? "single-staff" : ""}" style="--staff-count:${Math.max(1, staffGroups.length)}">${staffMarkup}</div>`;
}

function renderNowLine(at) {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (els.adminDateInput?.value !== toDateInputValue(now)
    || minutes < state.daySettings.openMinutes || minutes > state.daySettings.closeMinutes) return "";
  return `<div class="now-line" style="top:${at(minutes)}px" aria-hidden="true"></div>`;
}

function renderStaffTimeBlock(block, at, group) {
  const top = at(block.startMinutes);
  const height = Math.max(34, at(block.endMinutes) - top);
  const canDelete = canManageTimeBlock(block, group);
  const menu = canDelete ? `<details class="service-block-menu lane-menu time-block-menu"><summary aria-label="Sperre verwalten"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></summary><div class="service-block-options" role="menu"><button type="button" role="menuitem" class="clear-lane-option" data-time-block-delete="${escapeAttribute(block.id)}">Löschen</button></div></details>` : "";
  return `<article class="calendar-block time-block" style="top:${top}px;height:${height}px"><div class="block-heading"><strong>Blockiert</strong>${menu}</div><span>${escapeHtml(formatMinutes(block.startMinutes))}-${escapeHtml(formatMinutes(block.endMinutes))}</span></article>`;
}

function canManageTimeBlock(block, group = null) {
  if (state.accessRole !== "staff") return true;
  const staffId = group?.staffId || state.accessStaffId || null;
  return Boolean(staffId && staffId === state.accessStaffId && block.staffId === state.accessStaffId);
}

function renderStaffCalendarEvent(event, staffEvents, at) {
  const top = at(event.startMinutes);
  const height = Math.max(34, at(event.endMinutes) - top);
  const overlapsOtherLane = staffEvents.some((other) => other !== event && other.laneIndex !== event.laneIndex && hasTimeRangeOverlap(event, [other]));
  const service = serviceForItem(event);
  const label = service ? getServiceAbbrev(service) : t("admin.blockedSlot");
  const detail = event.kind === "online" ? (event.name || t("admin.unnamedCustomer")) : (event.note || "");
  if (event.kind === "blocked") return "";
  return `<article class="calendar-event ${overlapsOtherLane ? `split lane-${event.laneIndex}` : "full"}" style="--service-color:${escapeAttribute(service?.slotColor || service?.color || "#e7ece8")};top:${top}px;height:${height}px" title="${escapeAttribute(`${label} · ${formatMinutes(event.startMinutes)}-${formatMinutes(event.endMinutes)}`)}"><button class="event-main" type="button" data-event-detail="${escapeAttribute(event.id || event.scheduleEntryId || "")}" data-event-kind="${escapeAttribute(event.kind)}" aria-label="Termindetails: ${escapeAttribute(label)}"><strong>${escapeHtml(label)}</strong>${detail ? `<span class="event-detail">${escapeHtml(detail)}</span>` : ""}<span class="event-time">${escapeHtml(formatMinutes(event.startMinutes))}-${escapeHtml(formatMinutes(event.endMinutes))}</span>${event.kind === "online" ? `<span class="online-indicator" aria-label="Online" title="Online"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>` : ""}</button></article>`;
}

function renderCalendarDayBlock(rowCount) {
  const detail = state.daySettings.holidayName || t("admin.dayBlockedEmpty");
  return `
    <article class="calendar-time-block calendar-day-block" style="grid-column:2 / -1;grid-row:1 / span ${rowCount}" aria-label="${escapeAttribute(`Tag blockiert: ${detail}`)}">
      <strong>Tag blockiert</strong>
      <span>${escapeHtml(detail)}</span>
    </article>
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
  const detail = kind === "online" ? customerName : (item.note || "");
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
        <span class="event-detail">${detail ? escapeHtml(detail) : "&nbsp;"}</span>
        <span class="event-time">${escapeHtml(formatMinutes(item.startMinutes))}-${escapeHtml(formatMinutes(item.endMinutes))}</span>
      </button>
      ${kind === "online" ? `<span class="online-label">Online</span>` : ""}
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
  const service = serviceForItem(appointment);
  const isCancelled = appointment.status === "cancelled";
  const appointmentLane = state.laneLayout.find((lane) => lane.laneKey === appointment.laneKey);
  const canCancel = state.accessRole !== "staff" || canEditLane(appointmentLane || {});
  return `
    <article class="log-entry ${isCancelled ? "cancelled" : ""}">
      <div class="log-actions">${isCancelled || !canCancel ? "" : `<button class="cancel-log" type="button" data-log-cancel="${appointment.id}" aria-label="Buchung stornieren"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg><span>Stornieren</span></button>`}</div>
      <div class="log-copy">
        <div class="log-primary"><strong>${escapeHtml(appointment.name || t("admin.unnamedCustomer"))}</strong>${appointment.phone ? `<span class="log-phone">${escapeHtml(appointment.phone)}</span>` : ""}</div>
        <span>${escapeHtml(getServiceAbbrev(service))} · ${escapeHtml(appointment.date)} · ${escapeHtml(formatMinutes(appointment.startMinutes))}</span>
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
  const targetStaff = getAvailabilityStaffGroups();
  const globalScope = isGlobalAvailabilityScope();
  if (!globalScope && state.daySettings.isBlockedDay) return;
  if (!globalScope && targetStaff.length === 0) {
    showToast("Bitte waehlen Sie in der Ansicht mindestens einen Mitarbeiter aus.", "error");
    return;
  }
  const staffDayBlocks = targetStaff.map((staff) => state.timeBlocks.find((block) => (
    block.staffId === staff.staffId
    && block.startMinutes <= state.daySettings.openMinutes
    && block.endMinutes >= state.daySettings.closeMinutes
  ))).filter(Boolean);
  const nextBlocked = globalScope
    ? !state.daySettings.isBlockedDay
    : staffDayBlocks.length !== targetStaff.length;
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
    if (!globalScope) {
      if (nextBlocked) {
        const blockedStaffIds = new Set(staffDayBlocks.map((block) => block.staffId));
        await Promise.all(targetStaff.filter((staff) => !blockedStaffIds.has(staff.staffId)).map((staff) => (
          state.repository.createTimeBlock({
            date: els.adminDateInput.value,
            startMinutes: state.daySettings.openMinutes,
            endMinutes: state.daySettings.closeMinutes,
            staffId: staff.staffId,
          })
        )));
      } else {
        await Promise.all(staffDayBlocks.map((block) => state.repository.deleteTimeBlock(block.id)));
      }
    } else {
      await state.repository.setDayBlocked({
        ...state.daySettings,
        date: els.adminDateInput.value,
        isBlockedDay: nextBlocked,
      });
    }
    await refreshDateOptions();
    await refreshDayData();
    showToast(nextBlocked
      ? "Der Tag wurde erfolgreich für neue Buchungen gesperrt."
      : "Der Tag ist wieder für Buchungen freigegeben.");
  } catch (error) {
    await showAvailabilityError(error, "Der Tag konnte nicht blockiert werden.");
  } finally {
    renderDayBlockButton();
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
  const targetStaff = getAvailabilityStaffGroups();
  const globalScope = isGlobalAvailabilityScope();
  const staffBlocked = targetStaff.length > 0 && targetStaff.every((staff) => state.timeBlocks.some((block) => (
    block.staffId === staff.staffId
      && block.startMinutes <= state.daySettings.openMinutes
      && block.endMinutes >= state.daySettings.closeMinutes
  )));
  const blocked = state.daySettings.isBlockedDay || (globalScope ? false : staffBlocked);
  const label = blocked ? t("admin.unblockDay") : t("admin.blockDay");
  els.dayBlockButton.textContent = label;
  els.dayBlockButton.setAttribute("aria-label", label);
  els.dayBlockButton.classList.toggle("is-blocked", Boolean(blocked));
  els.dayBlockButton.disabled = state.daySettings.isBlockedDay && !globalScope;
}

function getAvailabilityStaffGroups() {
  const groups = groupLanesByStaff(state.laneLayout);
  if (state.accessRole === "staff") {
    const own = groups.find((group) => group.staffId === state.accessStaffId);
    return own ? [own] : [];
  }
  if (state.showAllStaff) return [];
  return groups.filter((group) => state.selectedVisibleStaffKeys.has(group.key));
}

function isGlobalAvailabilityScope() {
  return state.accessRole !== "staff" && state.showAllStaff;
}

function getAvailabilityScopeKey() {
  return isGlobalAvailabilityScope()
    ? "all"
    : getAvailabilityStaffGroups().map((group) => group.key).sort().join(",");
}

function getScopedTimeBlocks() {
  if (isGlobalAvailabilityScope()) return state.timeBlocks.filter((block) => !block.staffId);
  const staffIds = new Set(getAvailabilityStaffGroups().map((group) => group.staffId));
  return state.timeBlocks.filter((block) => !block.staffId || staffIds.has(block.staffId));
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
  const categories = [...new Set(getManualServicesForStaff(els.bookingEmployee.value).map((service) => service.category))];
  els.bookingCategory.innerHTML = categories.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(formatServiceCategory(category))}</option>`).join("");
  if (els.bookingNote) els.bookingNote.value = "";
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = "";
  updateManualServiceOptions();
  els.bookingDialog.showModal();
}

function formatServiceCategory(category) {
  const service = state.services.find((item) => item.category === category);
  return service?.categoryShortName || service?.categoryName
    || ({ cut: "Schnitt", color: "Farbe", care: "Pflege", shape: "Form" })[category] || category;
}

function updateManualServiceOptions() {
  if (!els.bookingService || !els.bookingCategory) return;
  const availableServices = getManualServicesForStaff(els.bookingEmployee?.value);
  const categories = [...new Set(availableServices.map((service) => service.category))];
  if (!categories.includes(els.bookingCategory.value)) {
    els.bookingCategory.innerHTML = categories.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(formatServiceCategory(category))}</option>`).join("");
  }
  const services = availableServices.filter((service) => service.category === els.bookingCategory.value);
  els.bookingService.innerHTML = services.map((service) => `<option value="${escapeAttribute(service.id)}">${escapeHtml(`${getServiceAbbrev(service)} · ${service.duration} Min.`)}</option>`).join("");
  els.bookingService.disabled = services.length === 0;
  if (!services.length) {
    els.bookingService.innerHTML = `<option value="">Keine passenden Services</option>`;
  }
  updateManualBookingTimes();
}

function getManualServicesForStaff(staffKey) {
  return state.services.filter((service) => (
    service.isActive
    && (!state.staffServiceKeys || state.staffServiceKeys.has(`${staffKey}:${service.id}`))
  ));
}

function getSelectedStaffLanes() {
  return state.laneLayout.filter((lane) => lane.staffKey === els.bookingEmployee?.value);
}

function updateManualBookingTimes() {
  if (!els.bookingStart) return;
  if (!els.bookingService?.value) {
    els.bookingStart.innerHTML = `<option value="">Keine freie Uhrzeit</option>`;
    els.bookingStart.disabled = true;
    const submit = els.manualBookingForm?.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    if (els.bookingFormMessage) els.bookingFormMessage.textContent = "Diesem Mitarbeiter ist kein aktiver Service zugeordnet.";
    return;
  }
  const service = findService(els.bookingService?.value);
  const lanes = getSelectedStaffLanes();
  const starts = [];
  for (let minute = state.daySettings.openMinutes; minute < state.daySettings.closeMinutes; minute += SLOT_STEP) {
    const staffId = lanes[0]?.staffId || null;
    if (state.timeBlocks.some((block) => (!block.staffId || block.staffId === staffId)
      && minute < block.endMinutes && minute + service.duration > block.startMinutes)) continue;
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
  if (!els.bookingService?.value) {
    els.bookingFormMessage.textContent = "Bitte wählen Sie einen verfügbaren Service.";
    return;
  }
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
    showToast(`${getServiceAbbrev(service)} um ${formatMinutes(startMinutes)} wurde für ${lane.staffShortName || lane.staffName} eingetragen.`);
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
  const service = serviceForItem(item);
  const lane = state.laneLayout.find((entry) => entry.laneKey === item.laneKey);
  const rows = [
    ["Service", service.shortName || service.name],
    ["Datum", formatLogDate(item.date || els.adminDateInput.value)],
    ["Uhrzeit", `${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)}`],
    ["Mitarbeiter", lane?.staffShortName || lane?.staffName || ""],
    kind === "online" ? ["Kunde", item.name || ""] : ["Notiz", item.note || item.reason || ""],
    kind === "online" ? ["Telefon", item.phone || ""] : null,
    kind === "online" ? ["E-Mail", item.email || ""] : null,
  ].filter((row) => row && row[1]);
  els.detailTitle.textContent = service.shortName || service.name;
  els.detailList.innerHTML = rows.map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const canDelete = kind === "manual" && canEditLane(lane || {});
  if (els.detailActions) els.detailActions.hidden = !canDelete;
  if (els.detailDelete) {
    els.detailDelete.dataset.entryId = canDelete ? String(item.id || item.scheduleEntryId || "") : "";
    els.detailDelete.dataset.laneKey = canDelete ? String(item.laneKey || "") : "";
  }
  els.detailDialog.showModal();
}

async function deleteSelectedManualEntry() {
  const entryId = els.detailDelete?.dataset.entryId;
  if (!entryId) return;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Termin löschen",
    message: "Dieser manuell angelegte Termin wird aus dem Tagesplan entfernt.",
    confirmLabel: "Löschen",
    tone: "danger",
  });
  if (!confirmed) return;
  try {
    await state.repository.deleteManualScheduleEntry(entryId);
    els.detailDialog?.close();
    await Promise.all([refreshDateOptions(), refreshDayData()]);
    showToast("Der manuelle Termin wurde gelöscht.");
  } catch (error) {
    showToast(`Termin konnte nicht gelöscht werden: ${error.message}`, "error");
  }
}

function renderTimeBlockControls() {
  if (!els.timeBlockStart || !els.timeBlockEnd || !els.timeBlockAction || !els.timeBlockToggle) return;
  const { openMinutes, closeMinutes, isBlockedDay } = state.daySettings;
  const date = els.adminDateInput?.value;
  const scopedBlocks = getScopedTimeBlocks();
  const signature = `${date}:${getAvailabilityScopeKey()}:${openMinutes}:${closeMinutes}:${scopedBlocks.map((block) => `${block.id}:${block.startMinutes}-${block.endMinutes}`).join(",")}`;
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
  const overlapsAnotherBlock = scopedBlocks.some((block) => (
    selectedStart < block.endMinutes && selectedEnd > block.startMinutes
  ));
  const scopeBlocked = isBlockedDay || (!isGlobalAvailabilityScope() && getAvailabilityStaffGroups().length > 0
    && getAvailabilityStaffGroups().every((staff) => state.timeBlocks.some((block) => (
      block.staffId === staff.staffId
        && block.startMinutes <= openMinutes
        && block.endMinutes >= closeMinutes
    ))));
  els.timeBlockToggle.disabled = scopeBlocked;
  els.timeBlockAction.disabled = scopeBlocked || overlapsAnotherBlock || selectedEnd <= selectedStart;
  if (els.timeBlockHint) {
    els.timeBlockHint.textContent = scopeBlocked
      ? "Der gesamte Tag ist bereits blockiert."
      : overlapsAnotherBlock
      ? "Die Auswahl überschneidet eine bestehende Sperre."
        : "";
  }
  if (els.existingTimeBlocks) {
    els.existingTimeBlocks.innerHTML = scopedBlocks.map((block) => `
      <div class="existing-block">
        <span>${escapeHtml(formatMinutes(block.startMinutes))}-${escapeHtml(formatMinutes(block.endMinutes))}</span>
        ${canManageTimeBlock(block) ? `<button type="button" data-unblock-time="${escapeAttribute(block.id)}" aria-label="${escapeAttribute(`${formatMinutes(block.startMinutes)} bis ${formatMinutes(block.endMinutes)} freigeben`)}">Freigeben</button>` : ""}
      </div>
    `).join("");
  }
}

function renderAvailabilityStaffOptions() {
  const groups = groupLanesByStaff(state.laneLayout);
  if (els.showAllStaff) els.showAllStaff.checked = state.showAllStaff;
  if (els.visibleStaffOptions) {
    els.visibleStaffOptions.innerHTML = groups.map((group) => {
      const checked = state.showAllStaff || state.selectedVisibleStaffKeys.has(group.key);
      return `<label><input type="checkbox" value="${escapeAttribute(group.key)}" ${checked ? "checked" : ""}><span><i style="--staff-color:${escapeAttribute(group.color)}">${escapeHtml(String(group.name || "M").slice(0, 2))}</i>${escapeHtml(group.name || group.fullName || group.key)}</span></label>`;
    }).join("");
  }
  if (els.staffVisibilityHint) {
    const limit = window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches ? 2 : 4;
    els.staffVisibilityHint.textContent = `Maximal ${limit} Mitarbeiter in dieser Ansicht`;
  }
  els.availabilityToggle?.classList.toggle("is-filtered", !state.showAllStaff);
}

function findAvailableTimeBlockRange(preferredStart, openMinutes, closeMinutes) {
  const starts = [];
  for (let start = openMinutes; start + SLOT_STEP <= closeMinutes; start += SLOT_STEP) starts.push(start);
  const ordered = [...starts.filter((start) => start >= preferredStart), ...starts.filter((start) => start < preferredStart)];
  for (const startMinutes of ordered) {
    for (const duration of [60, SLOT_STEP]) {
      const endMinutes = startMinutes + duration;
      if (endMinutes <= closeMinutes && !getScopedTimeBlocks().some((block) => startMinutes < block.endMinutes && endMinutes > block.startMinutes)) {
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
  if (getScopedTimeBlocks().some((block) => startMinutes < block.endMinutes && endMinutes > block.startMinutes)) return;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: "Uhrzeit blockieren",
    message: `${formatMinutes(startMinutes)}-${formatMinutes(endMinutes)} für neue Buchungen blockieren?`,
    confirmLabel: "Blockieren",
    tone: "danger",
  });
  if (!confirmed) return;

  els.timeBlockAction.disabled = true;
  try {
    const targets = getAvailabilityStaffGroups();
    if (!isGlobalAvailabilityScope() && targets.length === 0) {
      showToast("Bitte waehlen Sie in der Ansicht mindestens einen Mitarbeiter aus.", "error");
      return;
    }
    await Promise.all((isGlobalAvailabilityScope() ? [null] : targets).map((staff) => (
      state.repository.createTimeBlock({
        date: els.adminDateInput.value,
        startMinutes,
        endMinutes,
        staffId: staff?.staffId || null,
      })
    )));
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
        .select("id, name, short_name, duration_minutes, booked_slots, price, price_from, is_active, category, category_id, slot_color, sort_order, service_categories!services_category_salon_fkey(id, name, short_name, sort_order, is_active)")
        .eq("salon_id", salon.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []).map(fromSupabaseService);
    },
    async listLaneLayout() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_lanes")
        .select("id, lane_key, label, sort_order, salon_staff!inner(id, staff_key, name, short_name, display_color, sort_order, is_active)")
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
        staffShortName: row.salon_staff?.short_name || row.salon_staff?.name,
        staffColor: row.salon_staff?.display_color || "#d7ef57",
        staffSortOrder: row.salon_staff?.sort_order,
      })).sort((left, right) => (
        Number(left.staffSortOrder || 0) - Number(right.staffSortOrder || 0)
        || Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      ));
    },
    async listStaffServices() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_services")
        .select("service_id, salon_staff!inner(staff_key)")
        .eq("salon_id", salon.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((row) => {
        const staff = Array.isArray(row.salon_staff) ? row.salon_staff[0] : row.salon_staff;
        return { staffKey: staff?.staff_key, serviceId: row.service_id };
      }).filter((item) => item.staffKey && item.serviceId);
    },
    async listManualScheduleEntries(date) {
      const salon = await salonPromise;
      let { data, error } = await client
        .from("schedule_entries")
        .select("id, service_id, service_snapshot, entry_source, schedule_date, covered_start, covered_end, occupied_slots, note, staff_lanes!inner(lane_key)")
        .eq("salon_id", salon.id)
        .eq("schedule_date", date)
        .eq("status", "active")
        .neq("entry_source", "online")
        .order("covered_start", { ascending: true });
      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("schedule_entries")
          .select("id, service_id, service_snapshot, entry_source, schedule_date, covered_start, covered_end, occupied_slots, staff_lanes!inner(lane_key)")
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
    async getDaySnapshot(date) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_admin_day_snapshot", {
        p_salon_slug: salon.slug,
        p_schedule_date: date,
      });
      if (error && ["42883", "PGRST202"].includes(error.code)) return null;
      if (error) throw error;
      if (!data?.day_settings?.setting_date) return null;
      const entries = (data.manual_schedule_entries || []).map(fromSupabaseScheduleEntry);
      return {
        appointments: (data.appointments || []).map(fromSupabaseAppointment),
        daySettings: fromSupabaseDaySettings(data.day_settings),
        manualSchedule: { ...splitManualScheduleEntries(entries), isUnified: true },
        timeBlocks: (data.time_blocks || []).map(fromSupabaseTimeBlock),
      };
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
        .select("id, service_id, service_snapshot, appointment_date, start_time, end_time, occupied_slots, lane_key, status, customers:customers!appointments_customer_salon_fkey(name, phone, email, gender)")
        .eq("salon_id", salon.id)
        .eq("appointment_date", date)
        .order("start_time", { ascending: true });
      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("appointments")
          .select("id, service_id, service_snapshot, appointment_date, start_time, end_time, occupied_slots, status, customers:customers!appointments_customer_salon_fkey(name, phone, email, gender)")
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
          ? "id, service_id, service_snapshot, appointment_date, start_time, end_time, occupied_slots, lane_key, status, customers:customers!appointments_customer_salon_fkey(name, phone, email, gender)"
          : "id, service_id, service_snapshot, appointment_date, start_time, end_time, occupied_slots, status, customers:customers!appointments_customer_salon_fkey(name, phone, email, gender)";
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
      const { data: effectiveData, error: effectiveError } = await client.rpc("get_effective_day_settings", {
        p_salon_slug: salon.slug,
        p_setting_date: date,
      });
      if (!effectiveError) {
        const row = Array.isArray(effectiveData) ? effectiveData[0] : effectiveData;
        if (row) return fromSupabaseDaySettings(row);
      } else if (!["42883", "PGRST202"].includes(effectiveError.code)) {
        throw effectiveError;
      }
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
        .select("id, staff_id, block_date, start_time, end_time")
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
        p_staff_id: block.staffId || null,
      });
      if (error) throw error;
    },
    async deleteTimeBlock(blockId) {
      const { error } = await client.rpc("delete_admin_time_block", { p_block_id: blockId });
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
    .select("id, slug, name, address, phone, timezone, opening_hours, theme_preset, languages")
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
    : 4;
  const isDemoSalon = getCurrentSalonSlug() === "demo";
  return Array.from({ length: laneCount }, (_, index) => {
    const staffIndex = Math.floor(index / 2);
    return {
      ...createLaneDefinition(String.fromCharCode(97 + index), index + 1),
      staffKey: isDemoSalon ? ["default", "tony"][staffIndex] : `staff-${staffIndex + 1}`,
      staffName: isDemoSalon ? (["Linda", "Tony"][staffIndex] || `M${staffIndex + 1}`) : `M${staffIndex + 1}`,
      staffShortName: isDemoSalon ? (["L", "T"][staffIndex] || `M${staffIndex + 1}`) : `M${staffIndex + 1}`,
      staffColor: ["#f8c7ff", "#b8d9d0", "#d7ef57", "#c9c3e6"][staffIndex % 4],
      staffId: `demo-staff-${staffIndex + 1}`,
    };
  });
}

function normalizeLaneLayout(rows) {
  if (!Array.isArray(rows)) return createDefaultLaneLayout();
  if (rows.length === 0) return [];
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
        staffShortName: row.staffShortName || row.staffName || "M",
        staffColor: row.staffColor || "#d7ef57",
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
    async listStaffServices() { return window.OpenSlotLocalRepository?.listStaffServices?.() || null; },
    async listManualScheduleEntries() { return null; },
    async getDaySnapshot() { return null; },
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
    async getDaySettings(date) {
      const defaults = createDefaultDaySettings(date);
      const saved = loadLocalSettings()[date];
      return saved ? { ...defaults, ...saved, hasManualOverride: true } : defaults;
    },
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

function getLoadLaneLayout() {
  return state.accessRole === "staff" && state.accessStaffId
    ? state.laneLayout.filter((lane) => lane.staffId === state.accessStaffId)
    : state.laneLayout;
}

function countScheduleCapacity(daySettings) {
  return countDaySlots(daySettings) * getLoadLaneLayout().length;
}

function calculateScheduleLoad(appointments, manualEntries, daySettings, timeBlocks) {
  const lanes = getLoadLaneLayout();
  const laneKeys = new Set(lanes.map((lane) => lane.laneKey));
  const occupied = new Set();
  const addOccupiedRanges = (laneKey, item) => {
    if (!laneKeys.has(laneKey)) return;
    getOccupiedRanges(item).forEach((range) => {
      if (range.startMinutes < daySettings.openMinutes || range.startMinutes >= daySettings.closeMinutes) return;
      occupied.add(`${laneKey}:${range.startMinutes}`);
    });
  };

  const allocated = allocateAppointmentsByLane(
    appointments.filter((appointment) => appointment.status !== "cancelled"),
    state.laneLayout,
  );
  lanes.forEach((lane) => {
    (allocated.get(lane.laneKey) || []).forEach((appointment) => addOccupiedRanges(lane.laneKey, appointment));
  });
  manualEntries.forEach((entry) => addOccupiedRanges(entry.laneKey, entry));
  timeBlocks.forEach((block) => {
    lanes.filter((lane) => !block.staffId || lane.staffId === block.staffId).forEach((lane) => {
      for (let startMinutes = block.startMinutes; startMinutes < block.endMinutes; startMinutes += SLOT_STEP) {
        addOccupiedRanges(lane.laneKey, { startMinutes, endMinutes: startMinutes + SLOT_STEP });
      }
    });
  });
  return {
    occupiedSlotCount: occupied.size,
    totalSlotCount: countDaySlots(daySettings) * lanes.length,
  };
}

function isScheduledBusinessDay(date) {
  return getWeeklyRule(new Date(`${date}T00:00:00`)).openMinutes !== null;
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

function serviceForItem(item) {
  const current = state.services.find((service) => service.id === item?.serviceId);
  if (!item?.serviceSnapshot) return current || findService(item?.serviceId);
  const snapshotService = { ...current, ...item.serviceSnapshot, id: item.serviceId };
  if (!current || item.status === "cancelled" || String(item.date || "") < toDateInputValue(new Date())) return snapshotService;
  return {
    ...snapshotService,
    name: current.name,
    nameEn: current.nameEn,
    nameZh: current.nameZh,
    shortName: current.shortName,
    slotColor: current.slotColor,
    color: current.color || current.slotColor,
  };
}

function normalizeServiceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    name: snapshot.name || "",
    shortName: snapshot.shortName || snapshot.name || "",
    duration: Number(snapshot.durationMinutes || snapshot.duration || SLOT_STEP),
    bookedSlots: Array.isArray(snapshot.bookedSlots) ? snapshot.bookedSlots.map(Number) : [],
    price: Number(snapshot.price || 0),
    priceFrom: snapshot.priceFrom === true,
    category: snapshot.category?.legacyKey || snapshot.category?.id || snapshot.category || "",
    categoryName: snapshot.category?.name || "",
    categoryShortName: snapshot.category?.shortName || snapshot.category?.name || "",
    slotColor: snapshot.color || "",
    color: snapshot.color || "",
  };
}

function findService(id) {
  return state.services.find((service) => service.id === id) || { id, name: id, duration: 30, price: 0, isActive: false };
}

function sortServices(services) {
  return services.slice().sort((left, right) => {
    const leftCategory = Number.isFinite(left.categorySortOrder) ? left.categorySortOrder : 999;
    const rightCategory = Number.isFinite(right.categorySortOrder) ? right.categorySortOrder : 999;
    const leftService = Number.isFinite(left.sortOrder) ? left.sortOrder : getServiceSortIndex(left.id);
    const rightService = Number.isFinite(right.sortOrder) ? right.sortOrder : getServiceSortIndex(right.id);
    return (leftCategory - rightCategory) || (leftService - rightService) || left.name.localeCompare(right.name);
  });
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
  const holidayName = getBerlinHolidayName(date);
  if (weeklyRule.openMinutes === null) {
    return { date, openMinutes: DEFAULT_OPEN_MINUTES, closeMinutes: DEFAULT_CLOSE_MINUTES, isBlockedDay: true, holidayName, isPublicHoliday: Boolean(holidayName), hasManualOverride: false };
  }
  return { date, openMinutes: weeklyRule.openMinutes, closeMinutes: weeklyRule.closeMinutes, isBlockedDay: Boolean(holidayName), holidayName, isPublicHoliday: Boolean(holidayName), hasManualOverride: false };
}

function isBusinessDay(settings) {
  const weeklyRule = getWeeklyRule(new Date(`${settings.date}T00:00:00`));
  return weeklyRule.openMinutes !== null && !settings.isBlockedDay && settings.closeMinutes > settings.openMinutes;
}

function buildDateRange() {
  const today = new Date(`${toDateInputValue(new Date())}T00:00:00`);
  const last = new Date(today);
  const originalDay = last.getDate();
  last.setDate(1);
  last.setMonth(last.getMonth() + 2);
  last.setDate(Math.min(originalDay, new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate()));
  const dayCount = Math.floor((last - today) / 86400000) + 1;
  return Array.from({ length: dayCount }, (_, index) => {
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

function nextMondayDate(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  return toDateInputValue(date);
}

function previousCalendarPageDate(value) {
  const today = toDateInputValue(new Date());
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - 7);
  return date < new Date(`${today}T00:00:00`) ? today : toDateInputValue(date);
}

function getBerlinHolidayName(value) {
  const date = new Date(`${value}T12:00:00`);
  const fixed = {
    "01-01": "Neujahr",
    "03-08": "Internationaler Frauentag",
    "05-01": "Tag der Arbeit",
    "10-03": "Tag der Deutschen Einheit",
    "12-25": "1. Weihnachtstag",
    "12-26": "2. Weihnachtstag",
  };
  if (fixed[value.slice(5)]) return fixed[value.slice(5)];
  const year = date.getFullYear();
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day, 12);
  for (const [offset, name] of [[-2, "Karfreitag"], [1, "Ostermontag"], [39, "Christi Himmelfahrt"], [50, "Pfingstmontag"]]) {
    const holiday = new Date(easter);
    holiday.setDate(holiday.getDate() + offset);
    if (toDateInputValue(holiday) === value) return name;
  }
  return "";
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
  const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
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
    categoryId: row.category_id || category?.id || null,
    categoryName: category?.name || row.category,
    categoryShortName: category?.short_name || category?.name || row.category,
    categorySortOrder: Number.isFinite(Number(category?.sort_order)) ? Number(category.sort_order) : 999,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : undefined,
    gender: fallback?.gender || legacy?.gender || row.gender || "unisex",
    isActive: row.is_active,
  };
}

function stripSalonPrefix(id) {
  return String(id || "").replace(/^(lisa|demo)_/, "");
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
    serviceSnapshot: normalizeServiceSnapshot(row.service_snapshot),
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
    serviceSnapshot: normalizeServiceSnapshot(row.service_snapshot),
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
  return {
    date: row.setting_date,
    openMinutes: parseTime(row.open_time.slice(0, 5)),
    closeMinutes: parseTime(row.close_time.slice(0, 5)),
    isBlockedDay: row.is_blocked_day,
    holidayName: row.holiday_name || "",
    isPublicHoliday: Boolean(row.is_public_holiday),
    hasManualOverride: Boolean(row.has_manual_override),
  };
}

function fromSupabaseTimeBlock(row) {
  return {
    id: row.id,
    staffId: row.staff_id || null,
    date: row.block_date,
    startMinutes: parseTime(String(row.start_time).slice(0, 5)),
    endMinutes: parseTime(String(row.end_time).slice(0, 5)),
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
