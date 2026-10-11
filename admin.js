import { createSupabaseAdminRepository } from "./src/admin/supabase-admin-repository.mjs";
import {
  allocateAppointmentsByLane,
  calculateScheduleLoad as calculateAdminScheduleLoad,
  getCoverageEdgeClasses,
  getCoverageStarts,
  getDateLoadStatus,
  getOccupiedEdgeClasses,
  getOccupiedRanges,
  getServiceCoveredMinutes,
  getServiceOccupiedMinutes,
  groupLanesByStaff,
  hasOccupiedOverlap,
  hasTimeRangeOverlap,
  sortServices as sortAdminServices,
} from "./src/admin/schedule-model.mjs";
import { createTurnstileController } from "./src/admin/turnstile-controller.mjs";
import { createLocalAdminRepository } from "./src/admin/local-admin-repository.mjs";
import { renderAdminSchedule } from "./src/admin/schedule-view.mjs";

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
let previewSchedulePromise = null;
const previewSchedulesByDate = new Map();
const previewTimeBlocksByDate = new Map();
let manualEditorEntry = null;
let manualEditorContext = null;
let manualEditorRequestId = 0;
let ownerLoginPending = false;

const t = (key, values) => window.OpenSlotBackofficeI18n?.t(key, values) || window.OpenSlotI18n?.t(key, values) || key;
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
  staffVisibilityLimit: document.querySelector("#staffVisibilityLimit"),
  existingTimeBlocks: document.querySelector("#existingTimeBlocks"),
  addBookingButton: document.querySelector("#addBookingButton"),
  bookingDialog: document.querySelector("#bookingDialog"),
  manualBookingForm: document.querySelector("#manualBookingForm"),
  bookingDate: document.querySelector("#bookingDate"),
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
  detailEdit: document.querySelector("#detailEdit"),
  detailDelete: document.querySelector("#detailDelete"),
  actionToast: document.querySelector("#actionToast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastClose: document.querySelector("#toastClose"),
};

const ownerSecurity = createTurnstileController({
  windowObject: window,
  widget: els.ownerTurnstile,
  form: els.ownerLoginForm,
  errorMessage: () => t("admin.securityFailed"),
});

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
  els.addBookingButton?.addEventListener("click", () => openManualBookingDialog());
  els.manualBookingForm?.addEventListener("submit", submitManualBooking);
  els.bookingEmployee?.addEventListener("change", () => {
    setManualCategories();
    renderManualServiceOptions();
    renderManualBookingTimes({ filterByService: false });
    updateManualSubmitState();
  });
  els.bookingCategory?.addEventListener("change", () => {
    renderManualServiceOptions({ filterByTime: Boolean(els.bookingStart.value) });
    renderManualBookingTimes({ preferred: Number(els.bookingStart.value), filterByService: false });
    updateManualSubmitState();
  });
  els.bookingService?.addEventListener("change", () => {
    renderManualBookingTimes({ preferred: Number(els.bookingStart.value), filterByService: Boolean(els.bookingService.value) });
    updateManualSubmitState();
  });
  els.bookingStart?.addEventListener("change", () => {
    renderManualServiceOptions({ preferred: els.bookingService.value, filterByTime: Boolean(els.bookingStart.value) });
    updateManualSubmitState();
  });
  els.bookingDate?.addEventListener("change", () => loadManualEditorDate());
  els.detailEdit?.addEventListener("click", editSelectedManualEntry);
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
  window.dispatchEvent(new CustomEvent("openslot:admin-client-ready", { detail: { client } }));
  return createSupabaseAdminRepository({
    client,
    salonSlug: getCurrentSalonSlug(),
    appointmentPageSize: APPOINTMENT_PAGE_SIZE,
    mapService: fromSupabaseService,
    mapAppointment: fromSupabaseAppointment,
    mapScheduleEntry: fromSupabaseScheduleEntry,
    mapDaySettings: fromSupabaseDaySettings,
    mapTimeBlock: fromSupabaseTimeBlock,
    splitManualScheduleEntries,
    isMissingUnifiedSchedule,
    createDefaultDaySettings,
    cancelledEmailPending: t("admin.cancelledEmailPending"),
    onSalonLoaded: (salon) => {
      state.salon = salon;
      window.OpenSlotBackofficeI18n?.setLanguage(salon.admin_language || "de");
    },
  });
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
    setAdminMessage(t("admin.loadBookingsFailed", { message: error.message }));
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
  window.OpenSlotBackofficeI18n?.translatePage();
}

function applyShopProfile() {
  if (!state.salon) return;
  if (els.adminShopName) els.adminShopName.textContent = state.salon.name || "OpenSlot";
  document.title = `${state.salon.name || "OpenSlot"} · ${t("admin.titleSuffix")}`;
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
      showToast(t("admin.maxVisibleError", { count: limit }), "error");
      return;
    }
    state.selectedVisibleStaffKeys.add(input.value);
  } else {
    state.selectedVisibleStaffKeys.delete(input.value);
    if (state.selectedVisibleStaffKeys.size === 0) {
      input.checked = true;
      state.selectedVisibleStaffKeys.add(input.value);
      showToast(t("admin.minVisibleError"), "error");
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

function canEditLane(lane) {
  return state.accessRole !== "staff" || (state.accessStaffId && lane.staffId === state.accessStaffId);
}

function renderOutlookSchedule(slots, lanes) {
  return renderAdminSchedule({
    slots,
    lanes,
    daySettings: state.daySettings,
    timeBlocks: state.timeBlocks,
    selectedDate: els.adminDateInput?.value,
    translate: t,
    canEditLane,
    canManageTimeBlock,
    serviceForItem,
    getServiceAbbrev,
    toDateInputValue,
    slotStep: SLOT_STEP,
  });
}
function canManageTimeBlock(block, group = null) {
  if (state.accessRole !== "staff") return true;
  const staffId = group?.staffId || state.accessStaffId || null;
  return Boolean(staffId && staffId === state.accessStaffId && block.staffId === state.accessStaffId);
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

async function saveManualService(lane, startMinutes, service, existing = null, note = "", date = els.adminDateInput.value) {
  if (state.useUnifiedScheduleEntries) {
    const laneConfig = state.laneLayout.find((item) => item.storageKey === lane);
    if (!laneConfig?.staffLaneId) throw new Error("Für diesen Bereich fehlt eine aktive Lane-Konfiguration.");
    await state.repository.createManualScheduleEntry({
      date,
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
      date,
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
    date,
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
  if (ownerLoginPending) return;
  const submit = els.ownerLoginForm?.querySelector('[type="submit"]');
  ownerLoginPending = true;
  if (submit) submit.disabled = true;
  try {
    if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = t("admin.verifying");
    const captchaToken = await ownerSecurity.getToken();
    await state.repository.signIn(els.ownerEmail.value.trim(), els.ownerPassword.value, captchaToken);
    els.ownerPassword.value = "";
    ownerSecurity.clearToken();
  } catch (error) {
    if (els.ownerAuthMessage) els.ownerAuthMessage.textContent = t("admin.loginFailed", { message: error.message });
    ownerSecurity.reset();
  } finally {
    ownerLoginPending = false;
    if (submit) submit.disabled = false;
  }
}

async function handleOwnerLogout() {
  await state.repository.signOut();
  ownerSecurity.reset();
}

async function handleToggleDayBlock() {
  const targetStaff = getAvailabilityStaffGroups();
  const globalScope = isGlobalAvailabilityScope();
  if (!globalScope && state.daySettings.isBlockedDay) return;
  if (!globalScope && targetStaff.length === 0) {
    showToast(t("admin.selectVisibleEmployee"), "error");
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
    title: nextBlocked ? t("admin.blockDay") : t("admin.releaseDay"),
    message,
    confirmLabel: nextBlocked ? t("admin.blockDay") : t("admin.release"),
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
    title: t("admin.cancelBooking"),
    message: confirmMessages.cancelAppointment,
    confirmLabel: t("admin.cancel"),
    tone: "danger",
  });
  if (!confirmed) return;
  try {
    await state.repository.cancelAppointment(appointmentId);
    const mailMessage = await state.repository.sendBookingEmail(appointmentId);
    setAdminMessage(mailMessage || t("admin.cancelled"));
    await refreshDateOptions();
    await refreshDayData();
    await refreshUpcomingLog();
  } catch (error) {
    setAdminMessage(t("admin.cancelFailed", { message: error.message }));
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

async function openManualBookingDialog(entry = null) {
  if (!els.bookingDialog || !state.isOwner) return;
  manualEditorEntry = entry;
  const service = entry ? serviceForItem(entry) : null;
  const currentLane = entry ? state.laneLayout.find((lane) => lane.laneKey === entry.laneKey) : null;
  const staffGroups = groupLanesByStaff(state.laneLayout).filter((group) => (
    state.accessRole !== "staff" || group.staffId === state.accessStaffId
  ));
  els.bookingEmployee.innerHTML = staffGroups.map((group) => `<option value="${escapeAttribute(group.key)}">${escapeHtml(group.name)}</option>`).join("");
  if (currentLane?.staffKey && staffGroups.some((group) => group.key === currentLane.staffKey)) {
    els.bookingEmployee.value = currentLane.staffKey;
  }
  els.bookingEmployee.disabled = state.accessRole === "staff";
  els.bookingDate.value = entry?.date || els.adminDateInput.value;
  els.bookingDate.min = toDateInputValue(new Date());
  els.bookingDate.max = buildDateRange().at(-1);
  if (entry?.date && entry.date < els.bookingDate.min) els.bookingDate.min = entry.date;
  if (els.bookingNote) els.bookingNote.value = entry?.note || entry?.reason || "";
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = "";
  const title = entry ? t("admin.editAppointment") : t("admin.addAppointment");
  document.querySelector("#bookingDialogTitle").textContent = title;
  setManualCategories(service?.category || "");
  els.bookingDialog.showModal();
  await loadManualEditorDate({
    preferredServiceId: service?.id || entry?.serviceId || "",
    preferredStart: entry?.startMinutes ?? null,
  });
}

function formatServiceCategory(category) {
  const service = state.services.find((item) => item.category === category);
  return service?.categoryShortName || service?.categoryName
    || ({ cut: "Schnitt", color: "Farbe", care: "Pflege", shape: "Form" })[category] || category;
}

function setManualCategories(preferred = "") {
  const categories = [...new Set(getManualServicesForStaff(els.bookingEmployee?.value).map((service) => service.category))];
  els.bookingCategory.innerHTML = categories.map((category) => `<option value="${escapeAttribute(category)}">${escapeHtml(formatServiceCategory(category))}</option>`).join("");
  if (categories.includes(preferred)) els.bookingCategory.value = preferred;
}

function getManualEditorServices() {
  return getManualServicesForStaff(els.bookingEmployee?.value)
    .filter((service) => service.category === els.bookingCategory?.value);
}

function renderManualServiceOptions({ preferred = "", filterByTime = false } = {}) {
  const startMinutes = Number(els.bookingStart?.value);
  const services = getManualEditorServices().filter((service) => (
    !filterByTime || !Number.isFinite(startMinutes) || canPlaceManualEditorService(service, startMinutes)
  ));
  els.bookingService.innerHTML = `<option value="">${escapeHtml(t("admin.chooseService"))}</option>${services.map((service) => `<option value="${escapeAttribute(service.id)}">${escapeHtml(`${getServiceAbbrev(service)} · ${service.duration} Min.`)}</option>`).join("")}`;
  if (services.some((service) => service.id === preferred)) els.bookingService.value = preferred;
  els.bookingService.disabled = services.length === 0;
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

function currentManualContext() {
  return {
    appointments: state.appointments,
    daySettings: state.daySettings,
    manualEntries: state.manualEntries,
    timeBlocks: state.timeBlocks,
  };
}

async function fetchManualContext(date) {
  if (date === els.adminDateInput.value) return currentManualContext();
  const snapshot = await state.repository.getDaySnapshot?.(date);
  if (snapshot) {
    return {
      appointments: snapshot.appointments,
      daySettings: snapshot.daySettings,
      manualEntries: snapshot.manualSchedule.allEntries || [],
      timeBlocks: snapshot.timeBlocks,
    };
  }
  const [appointments, daySettings, manualSchedule, timeBlocks] = await Promise.all([
    state.repository.listAppointments(date),
    state.repository.getDaySettings(date),
    loadManualSchedule(date),
    state.repository.listTimeBlocks(date),
  ]);
  return { appointments, daySettings, manualEntries: manualSchedule.allEntries || [], timeBlocks };
}

async function loadManualEditorDate({ preferredServiceId = els.bookingService?.value || "", preferredStart = Number(els.bookingStart?.value) } = {}) {
  const requestId = ++manualEditorRequestId;
  const submit = els.manualBookingForm?.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = t("admin.checkingTimes");
  try {
    const context = await fetchManualContext(els.bookingDate.value);
    if (requestId !== manualEditorRequestId) return;
    manualEditorContext = context;
    renderManualServiceOptions({ preferred: preferredServiceId });
    renderManualBookingTimes({ preferred: preferredStart, filterByService: Boolean(preferredServiceId) });
    updateManualSubmitState();
  } catch (error) {
    if (requestId !== manualEditorRequestId) return;
    manualEditorContext = null;
    if (els.bookingFormMessage) els.bookingFormMessage.textContent = t("admin.loadTimesFailed", { message: error.message });
  }
}

function canPlaceManualEditorService(service, startMinutes) {
  if (!service || !manualEditorContext || !Number.isFinite(startMinutes)) return false;
  const { daySettings, appointments, manualEntries, timeBlocks } = manualEditorContext;
  if (daySettings?.isBlockedDay || startMinutes < daySettings.openMinutes || startMinutes >= daySettings.closeMinutes) return false;
  const endMinutes = startMinutes + service.duration;
  const lanes = getSelectedStaffLanes();
  const staffId = lanes[0]?.staffId || null;
  if (timeBlocks.some((block) => (!block.staffId || block.staffId === staffId)
    && startMinutes < block.endMinutes && endMinutes > block.startMinutes)) return false;
  return lanes.some((lane) => canPlaceManualEditorServiceOnLane(service, startMinutes, lane, { appointments, manualEntries }));
}

function canPlaceManualEditorServiceOnLane(service, startMinutes, lane, context = manualEditorContext) {
  if (!service || !lane || !context) return false;
  const candidate = { startMinutes, endMinutes: startMinutes + service.duration };
  const allocated = allocateAppointmentsByLane(
    context.appointments.filter((item) => item.status !== "cancelled"),
    state.laneLayout,
  );
  const online = allocated.get(lane.laneKey) || [];
  const manual = context.manualEntries.filter((item) => (
    item.laneKey === lane.laneKey
    && String(item.id || item.scheduleEntryId) !== String(manualEditorEntry?.id || manualEditorEntry?.scheduleEntryId || "")
  ));
  return !hasTimeRangeOverlap(candidate, online) && !hasTimeRangeOverlap(candidate, manual);
}

function renderManualBookingTimes({ preferred = null, filterByService = true } = {}) {
  if (!els.bookingStart || !manualEditorContext) return;
  const selectedService = findService(els.bookingService?.value);
  const services = filterByService && selectedService ? [selectedService] : getManualEditorServices();
  const starts = [];
  for (let minute = manualEditorContext.daySettings.openMinutes; minute < manualEditorContext.daySettings.closeMinutes; minute += SLOT_STEP) {
    if (services.some((service) => canPlaceManualEditorService(service, minute))) starts.push(minute);
  }
  els.bookingStart.innerHTML = `<option value="">${escapeHtml(t("admin.chooseTime"))}</option>${starts.map((minute) => `<option value="${minute}">${escapeHtml(formatMinutes(minute))}</option>`).join("")}`;
  if (starts.includes(Number(preferred))) els.bookingStart.value = String(preferred);
  els.bookingStart.disabled = starts.length === 0;
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = starts.length ? "" : t("admin.noMatchingTime");
}

function updateManualSubmitState() {
  const submit = els.manualBookingForm?.querySelector('[type="submit"]');
  const service = findService(els.bookingService?.value);
  const startMinutes = Number(els.bookingStart?.value);
  const valid = Boolean(els.bookingDate?.value && service && els.bookingStart?.value
    && canPlaceManualEditorService(service, startMinutes));
  if (submit) submit.disabled = !valid;
  if (valid && els.bookingFormMessage) els.bookingFormMessage.textContent = "";
}

async function submitManualBooking(event) {
  event.preventDefault();
  if (!els.bookingService?.value) {
    els.bookingFormMessage.textContent = t("admin.chooseAvailableService");
    return;
  }
  const service = findService(els.bookingService.value);
  const startMinutes = Number(els.bookingStart.value);
  const lane = getSelectedStaffLanes().find((candidate) => (
    canPlaceManualEditorService(service, startMinutes)
    && canPlaceManualEditorServiceOnLane(service, startMinutes, candidate)
  ));
  if (!lane) {
    els.bookingFormMessage.textContent = t("admin.timeNoLongerFree");
    renderManualBookingTimes({ filterByService: true });
    return;
  }
  const submit = els.manualBookingForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await saveManualService(
      lane.storageKey,
      startMinutes,
      service,
      manualEditorEntry ? { scheduleEntryId: manualEditorEntry.id || manualEditorEntry.scheduleEntryId } : null,
      els.bookingNote?.value.trim() || "",
      els.bookingDate.value,
    );
    els.bookingDialog.close();
    els.adminDateInput.value = els.bookingDate.value;
    const selectedIndex = state.dateOptions.findIndex((option) => option.date === els.bookingDate.value);
    if (selectedIndex >= 0) state.datePageStart = getCalendarPageStart(selectedIndex);
    await refreshDateOptions();
    await refreshDayData();
    showToast(t("admin.appointmentSaved", { service: getServiceAbbrev(service), time: formatMinutes(startMinutes), staff: lane.staffShortName || lane.staffName, action: t(manualEditorEntry ? "admin.updated" : "admin.created") }));
    manualEditorEntry = null;
    manualEditorContext = null;
  } catch (error) {
    els.bookingFormMessage.textContent = "";
    showToast(t("admin.saveFailed", { message: error.message }), "error");
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
    [t("admin.service"), service.shortName || service.name],
    [t("common.date"), formatLogDate(item.date || els.adminDateInput.value)],
    [t("common.time"), `${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)}`],
    [t("admin.employee"), lane?.staffShortName || lane?.staffName || ""],
    kind === "online" ? [t("admin.customer"), item.name || ""] : [t("common.note"), item.note || item.reason || ""],
    kind === "online" ? [t("common.phone"), item.phone || ""] : null,
    kind === "online" ? [t("common.email"), item.email || ""] : null,
  ].filter((row) => row && row[1]);
  els.detailTitle.textContent = service.shortName || service.name;
  els.detailList.innerHTML = rows.map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  const canDelete = kind === "manual" && canEditLane(lane || {});
  if (els.detailActions) els.detailActions.hidden = !canDelete;
  if (els.detailEdit) {
    els.detailEdit.dataset.entryId = canDelete ? String(item.id || item.scheduleEntryId || "") : "";
  }
  if (els.detailDelete) {
    els.detailDelete.dataset.entryId = canDelete ? String(item.id || item.scheduleEntryId || "") : "";
    els.detailDelete.dataset.laneKey = canDelete ? String(item.laneKey || "") : "";
  }
  els.detailDialog.showModal();
}

function editSelectedManualEntry() {
  const entryId = els.detailEdit?.dataset.entryId;
  if (!entryId) return;
  const entry = state.manualEntries.find((item) => String(item.id || item.scheduleEntryId) === entryId);
  if (!entry) {
    showToast(t("admin.appointmentMissing"), "error");
    return;
  }
  els.detailDialog?.close();
  openManualBookingDialog(entry);
}

async function deleteSelectedManualEntry() {
  const entryId = els.detailDelete?.dataset.entryId;
  if (!entryId) return;
  const confirmed = await window.OpenSlotConfirm.ask({
    title: t("admin.manualDeleteTitle"),
    message: t("admin.manualDeleteMessage"),
    confirmLabel: t("common.delete"),
    tone: "danger",
  });
  if (!confirmed) return;
  try {
    await state.repository.deleteManualScheduleEntry(entryId);
    els.detailDialog?.close();
    await Promise.all([refreshDateOptions(), refreshDayData()]);
    showToast(t("admin.manualDeleted"));
  } catch (error) {
    showToast(t("admin.manualDeleteFailed", { message: error.message }), "error");
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
      ? t("admin.wholeDayBlocked")
      : overlapsAnotherBlock
      ? t("admin.blockOverlap")
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
  if (els.staffVisibilityLimit) {
    const limit = window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches ? 2 : 4;
    els.staffVisibilityLimit.textContent = t("admin.maxEmployees", { count: limit });
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
    title: t("admin.blockTime"),
    message: t("admin.blockTimeConfirm", { start: formatMinutes(startMinutes), end: formatMinutes(endMinutes) }),
    confirmLabel: t("admin.block"),
    tone: "danger",
  });
  if (!confirmed) return;

  els.timeBlockAction.disabled = true;
  try {
    const targets = getAvailabilityStaffGroups();
    if (!isGlobalAvailabilityScope() && targets.length === 0) {
      showToast(t("admin.selectVisibleEmployee"), "error");
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
    await showAvailabilityError(error, t("admin.timeBlockFailed"));
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
      staffAcceptsOnline: true,
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
      staffAcceptsOnline: row.staffAcceptsOnline === true,
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
  return createLocalAdminRepository({
    storage: localStorage,
    cryptoApi: crypto,
    keys: {
      appointments: STORAGE_KEY,
      daySettings: SETTINGS_KEY,
      blockedSlots: BLOCKS_KEY,
      timeBlocks: TIME_BLOCKS_KEY,
    },
    isLaneDemo,
    loadServices: loadLocalServices,
    loadLaneLayout: createDefaultLaneLayout,
    loadStaffServices: () => window.OpenSlotLocalRepository?.listStaffServices?.() || null,
    loadAppointments: loadLocalAppointments,
    loadDaySettings: loadLocalSettings,
    saveDaySettings: (values) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(values)),
    loadTimeBlocks: () => JSON.parse(localStorage.getItem(TIME_BLOCKS_KEY) || "[]"),
    saveTimeBlocks: (values) => localStorage.setItem(TIME_BLOCKS_KEY, JSON.stringify(values)),
    previewTimeBlocksByDate,
    loadPreviewSchedule,
    loadBlockedSlots: loadLocalBlocks,
    saveBlockedSlots: (values) => localStorage.setItem(BLOCKS_KEY, JSON.stringify(values)),
    loadStaffSlots: loadLocalStaffSlots,
    saveStaffSlot: saveLocalStaffSlot,
    deleteStaffSlot: deleteLocalStaffSlot,
    getSelectedDate: () => els.adminDateInput.value,
    getActiveAppointments: () => state.appointments.filter((appointment) => appointment.status !== "cancelled"),
    getManualGroups: getAllManualGroups,
    getOccupiedRanges,
    createDefaultDaySettings,
  });
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

function findOverlap(candidate, ranges) {
  return ranges.find((range) => hasOverlap(candidate, [range]));
}

function getDateStatus(option) {
  return getDateLoadStatus(option);
}

function countDaySlots(daySettings) {
  if (!daySettings || !isScheduledBusinessDay(daySettings.date)) return 0;
  return Math.max(0, Math.floor((daySettings.closeMinutes - daySettings.openMinutes) / SLOT_STEP));
}

function getOnlineLoadLaneLayout() {
  return state.laneLayout.filter((lane) => lane.staffAcceptsOnline === true);
}

function countScheduleCapacity(daySettings) {
  return countDaySlots(daySettings) * getOnlineLoadLaneLayout().length;
}

function calculateScheduleLoad(appointments, manualEntries, daySettings, timeBlocks) {
  return calculateAdminScheduleLoad({
    appointments,
    manualEntries,
    daySettings,
    timeBlocks,
    laneLayout: state.laneLayout,
    slotStep: SLOT_STEP,
  });
}

function isScheduledBusinessDay(date) {
  return getWeeklyRule(new Date(`${date}T00:00:00`)).openMinutes !== null;
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
  return sortAdminServices(services, getServiceSortIndex);
}

function getServiceSortIndex(id) {
  return SERVICE_ORDER.get(stripSalonPrefix(id)) ?? 999;
}

function hasOverlap(candidate, ranges) {
  return hasOccupiedOverlap(candidate, ranges, SLOT_STEP);
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
