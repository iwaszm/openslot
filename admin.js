import { createSupabaseAdminRepository } from "./src/admin/supabase-admin-repository.mjs?v=20261021-admin-performance-1";
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
import { renderAdminSchedule } from "./src/admin/schedule-view.mjs?v=20261011-quick-create-2";
import {
  canPlaceManualService as canPlaceManualEditorServiceInContext,
  canPlaceManualServiceOnLane as canPlaceManualEditorServiceOnLaneInContext,
  findAvailableManualLane,
  getAvailableManualStarts,
  getManualServicesForStaff as filterManualServicesForStaff,
} from "./src/admin/manual-booking-model.mjs";
import {
  renderBookingLog,
  renderBookingLogAppointment,
  renderCollapseIcon,
  sortUpcomingAppointments,
} from "./src/admin/booking-log-view.mjs";
import { escapeAttribute, escapeHtml } from "./src/core/html.mjs";
import { formatMinutes, parseTime } from "./src/core/time.mjs";
import { getBerlinHolidayName, toDateInputValue } from "./src/booking/calendar.mjs";
import { createAvailabilityController } from "./src/admin/availability-controller.mjs";
import { createAdminDialogController } from "./src/admin/dialog-controller.mjs";
import { createLiveRefreshController } from "./src/admin/live-refresh-controller.mjs";
import { createAdminState } from "./src/admin/admin-state.mjs?v=20261021-admin-performance-1";
import { createAdminMappers } from "./src/admin/admin-mappers.mjs";
import { createAdminSessionController } from "./src/admin/auth/session-controller.mjs?v=20261021-admin-performance-1";
import { createDateNavigationController } from "./src/admin/schedule/date-navigation.mjs";
import { createManualBookingController } from "./src/admin/appointments/manual-booking-controller.mjs?v=20261011-manual-dialog-1";
import { createVoiceInputController } from "./src/admin/voice-input-controller.mjs";
import { playAppointmentCreatedSound, playAppointmentDeletedSound, prepareAudioFeedback } from "./src/core/audio-feedback.mjs";

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

const state = createAdminState({
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  laneLayout: createDefaultLaneLayout(),
  services: DEFAULT_SERVICES,
});
const {
  fromAppointment: fromSupabaseAppointment,
  fromDaySettings: fromSupabaseDaySettings,
  fromScheduleEntry: fromSupabaseScheduleEntry,
  fromService: fromSupabaseService,
  fromTimeBlock: fromSupabaseTimeBlock,
  isMissingUnifiedSchedule,
  stripSalonPrefix,
} = createAdminMappers({
  defaultServices: DEFAULT_SERVICES,
  legacyServiceMeta: LEGACY_SERVICE_META,
  normalizeServiceSnapshot,
});
let lastDateOptionsRefresh = 0;
let pendingDayRender = false;
let dayRefreshSequence = 0;
let logRefreshSequence = 0;
let dateOptionsRefreshSequence = 0;
let toastTimeout = null;
let previewSchedulePromise = null;
const previewSchedulesByDate = new Map();
const previewTimeBlocksByDate = new Map();

const t = (key, values) => window.OpenSlotBackofficeI18n?.t(key, values) || window.OpenSlotI18n?.t(key, values) || key;
const getAdminLocale = () => ({ zh: "zh-CN", en: "en-GB", de: "de-DE" })[window.OpenSlotI18n?.language] || "de-DE";
const getServiceName = (service) => service.name;
const confirmMessages = {
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
  voiceAppointmentControl: document.querySelector("#voiceAppointmentControl"),
  voiceAppointmentButton: document.querySelector("#voiceAppointmentButton"),
  voiceAppointmentStatus: document.querySelector("#voiceAppointmentStatus"),
};

const ownerSecurity = createTurnstileController({
  windowObject: window,
  widget: els.ownerTurnstile,
  form: els.ownerLoginForm,
  errorMessage: () => t("admin.securityFailed"),
});

const availabilityController = createAvailabilityController({
  elements: els,
  closeServiceMenus: closeServiceBlockMenus,
  onCreateTimeBlock: handleCreateTimeBlock,
  onDeleteTimeBlock: deleteTimeBlockById,
  onRenderTimeControls: renderTimeBlockControls,
  onToggleDayBlock: handleToggleDayBlock,
});

const detailController = createAdminDialogController({
  elements: {
    dialog: els.detailDialog,
    title: els.detailTitle,
    list: els.detailList,
    actions: els.detailActions,
    edit: els.detailEdit,
    delete: els.detailDelete,
  },
  t,
  formatDate: (value) => formatLogDate(value || els.adminDateInput.value),
  formatTime: formatMinutes,
  getItem: (id, kind) => kind === "online"
    ? state.appointments.find((entry) => String(entry.id) === String(id))
    : state.manualEntries.find((entry) => String(entry.id || entry.scheduleEntryId) === String(id)),
  getLane: (item) => {
    const lane = state.laneLayout.find((entry) => entry.laneKey === item.laneKey);
    return lane ? { ...lane, canEdit: canEditLane(lane) } : null;
  },
  getService: serviceForItem,
  onEdit: editSelectedManualEntry,
  onDelete: deleteSelectedManualEntry,
});

const liveRefreshController = createLiveRefreshController({
  intervalMs: LIVE_REFRESH_MS,
  isEnabled: () => state.isOwner,
  refresh: refreshLiveData,
  onFailure: (error) => {
    if (state.isOwner && els.adminSyncNotice) els.adminSyncNotice.hidden = false;
    console.warn("Admin refresh failed:", error);
  },
});
let sessionController = null;
let voiceInputController = null;
const manualBookingController = createManualBookingController({
  elements: { add: els.addBookingButton, dialog: els.bookingDialog, form: els.manualBookingForm, employee: els.bookingEmployee,
    category: els.bookingCategory, service: els.bookingService, start: els.bookingStart, date: els.bookingDate },
  handlers: { open: openManualBookingDialog, submit: submitManualBooking, setCategories: setManualCategories,
    renderServices: renderManualServiceOptions, renderTimes: renderManualBookingTimes,
    updateServiceColor: updateManualServiceColor, updateSubmit: updateManualSubmitState,
    normalizeDate: normalizeManualBookingDate, loadDate: loadManualEditorDate },
});
const dateNavigation = createDateNavigationController({
  elements: { input: els.adminDateInput, strip: els.adminDateStrip, month: els.calendarMonth,
    previous: els.adminDatePrevButton, next: els.adminDateNextButton, today: els.todayButton },
  state,
  formatButtonLabel: formatDateButtonLabel,
  getLocale: getAdminLocale,
  getWeeklyRule,
  refreshDay: refreshDayData,
  refreshOptions: refreshDateOptions,
  toDateValue: toDateInputValue,
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
  setText("#manualBookingForm .text-button", "common.cancel");
  setText("#manualBookingForm .solid-button", "common.save");
  setText("#detailEdit span", "admin.editAppointment");
  setText("#detailDelete span", "admin.deleteAppointment");
  setLabel("#availabilityToggle", "admin.manageAvailability");
  setLabel("#addBookingButton", "admin.addAppointment");
  setLabel("#ownerLogoutButton", "admin.logout");
  setLabel("#pushToggleButton", "admin.enableNotifications");
  setLabel("#logCollapseButton", "admin.collapseLog");
  setLabel("#toastClose", "admin.close");
  document.querySelectorAll(".dialog-close").forEach((button) => button.setAttribute("aria-label", t("admin.close")));
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

function initializeDemoVoiceInput() {
  if (voiceInputController || getCurrentSalonSlug() !== "demo"
    || !els.voiceAppointmentButton || !els.voiceAppointmentStatus) return;
  const config = window.OPENSLOT_SUPABASE || {};
  voiceInputController = createVoiceInputController({
    button: els.voiceAppointmentButton,
    status: els.voiceAppointmentStatus,
    endpoint: config.voiceWorkerUrl || "/api/admin-voice",
    getRequestHeaders: async () => {
      const token = await state.repository.getAccessToken?.();
      if (!token) throw Object.assign(new Error("请重新登录后再使用语音预约。"), { code: "UNAUTHORIZED" });
      return {
        Authorization: `Bearer ${token}`,
        "X-Supabase-Anon-Key": config.anonKey || "",
      };
    },
    getContext: buildDemoVoiceContext,
    createAppointment: createDemoVoiceAppointment,
    showToast,
  });
  els.voiceAppointmentControl.hidden = !state.isOwner;
}

function buildDemoVoiceContext() {
  const staffGroups = groupLanesByStaff(state.laneLayout).filter((group) => (
    state.accessRole !== "staff" || group.staffId === state.accessStaffId
  ));
  const services = state.services.filter((service) => service.isActive).map((service) => ({
    id: service.id,
    aliases: [service.name, service.nameEn, service.nameZh, service.shortName].filter(Boolean),
  }));
  return {
    salonSlug: "demo",
    currentDate: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()),
    selectedDate: els.adminDateInput.value,
    timezone: "Europe/Berlin",
    language: ["de", "en", "zh"].includes(state.salon?.admin_language)
      ? state.salon.admin_language
      : (window.OpenSlotI18n?.language || "de"),
    services,
    staff: staffGroups.map((group) => ({
      key: group.key,
      aliases: [group.fullName, group.name].filter(Boolean),
      serviceIds: state.services.filter((service) => (
        service.isActive && (!state.staffServiceKeys || state.staffServiceKeys.has(`${group.key}:${service.id}`))
      )).map((service) => service.id),
    })),
    defaultStaffKey: staffGroups[0]?.key || "",
  };
}

async function createDemoVoiceAppointment(appointment) {
  const minimumDate = toDateInputValue(new Date());
  const maximumDate = buildDateRange().at(-1);
  if (appointment.date < minimumDate || appointment.date > maximumDate) {
    throw new Error("预约日期超出后台日历范围。");
  }
  const service = findService(appointment.serviceId);
  if (!service?.isActive) throw Object.assign(new Error("未识别到有效的预约项目。"), { code: "UNKNOWN_SERVICE" });
  const staffGroup = groupLanesByStaff(state.laneLayout).find((group) => group.key === appointment.staffKey);
  if (!staffGroup || (state.accessRole === "staff" && staffGroup.staffId !== state.accessStaffId)) {
    throw Object.assign(new Error("未识别到有权限操作的员工。"), { code: "UNKNOWN_STAFF" });
  }
  if (state.staffServiceKeys && !state.staffServiceKeys.has(`${staffGroup.key}:${service.id}`)) {
    throw Object.assign(new Error(`${staffGroup.name} 不提供该项目。`), { code: "STAFF_SERVICE_MISMATCH" });
  }
  const startMinutes = parseTime(appointment.startTime);
  if (!Number.isFinite(startMinutes) || startMinutes % SLOT_STEP !== 0) {
    throw Object.assign(new Error("预约时间必须落在 30 分钟刻度上。"), { code: "INVALID_TIME" });
  }
  const context = await fetchManualContext(appointment.date);
  const canPlaceOnLane = (lane) => canPlaceManualEditorServiceOnLaneInContext({
    service,
    startMinutes,
    lane,
    appointments: context.appointments,
    manualEntries: context.manualEntries,
    laneLayout: state.laneLayout,
  });
  const allowed = canPlaceManualEditorServiceInContext({
    service,
    startMinutes,
    ...context,
    staffLanes: staffGroup.lanes,
    laneLayout: state.laneLayout,
  });
  const lane = allowed ? findAvailableManualLane({ staffLanes: staffGroup.lanes, canPlaceOnLane }) : null;
  if (!lane) throw new Error(`${appointment.startTime} 已无可用 Lane。`);

  await saveManualService(lane.storageKey, startMinutes, service, null, appointment.note || "", appointment.date);
  playAppointmentCreatedSound();
  els.adminDateInput.value = appointment.date;
  const selectedIndex = state.dateOptions.findIndex((option) => option.date === appointment.date);
  if (selectedIndex >= 0) state.datePageStart = getCalendarPageStart(selectedIndex);
  await Promise.all([refreshDateOptions(), refreshDayData(), refreshUpcomingLog()]);
  showToast(`${appointment.startTime} ${getServiceAbbrev(service)} · ${staffGroup.name} 已创建。`);
}

init();

async function init() {
  document.addEventListener("pointerdown", prepareAudioFeedback, { capture: true, once: true });
  translateStaticAdminUi();
  if (els.adminDateInput) {
    els.adminDateInput.value = toDateInputValue(new Date());
    els.adminDateInput.min = toDateInputValue(new Date());
    els.adminDateInput.max = buildDateRange().at(-1);
  }
  state.repository = createRepository();
  bindEvents();
  dateNavigation.bind();
  manualBookingController.bind();
  sessionController = createAdminSessionController({
    elements: { form: els.ownerLoginForm, email: els.ownerEmail, password: els.ownerPassword,
      message: els.ownerAuthMessage, logout: els.ownerLogoutButton },
    repository: state.repository,
    security: ownerSecurity,
    state,
    t,
    renderAuthState,
    onAccessChanged: async () => {
      await Promise.all([refreshServices(), refreshLaneLayout(), refreshStaffServices()]);
      await Promise.all([refreshDateOptions(), refreshDayData(), refreshUpcomingLog()]);
    },
  });
  sessionController.bind();
  await sessionController.initialize();
  await refreshServices();
  await refreshLaneLayout();
  await refreshStaffServices();
  await refreshDateOptions();
  await refreshDayData();
  await refreshUpcomingLog();
  initializeDemoVoiceInput();
  liveRefreshController.start();
}

function isEditingSchedule() {
  return Boolean(document.querySelector(".confirm-dialog[open], .service-block-menu[open], #timeBlockPanel:not([hidden])"))
    || Boolean(document.activeElement?.closest("#ownerControls input, #ownerControls select, #ownerControls textarea"));
}

async function refreshLiveData() {
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
  if (state.isOwner && els.adminSyncNotice) els.adminSyncNotice.hidden = dayOk && logOk && datesOk;
}

function bindEvents() {
  availabilityController.bind();
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
  detailController.bind();
  els.toastClose?.addEventListener("click", () => {
    window.clearTimeout(toastTimeout);
    if (els.actionToast) els.actionToast.hidden = true;
  });
  els.logCollapseButton?.addEventListener("click", () => toggleSection("log"));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".service-block-menu")) closeServiceBlockMenus();
  });
  window.addEventListener("openslot:language-change", () => {
    translateStaticAdminUi();
    render();
  });
  let resizeFrame = null;
  window.addEventListener("resize", () => {
    if (resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      renderSlotManager();
    });
  });
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
      const snapshot = await state.repository.getDaySnapshot?.(date);
      const [appointments, daySettings, manualSchedule, timeBlocks] = snapshot
        ? [snapshot.appointments, snapshot.daySettings, snapshot.manualSchedule, snapshot.timeBlocks]
        : await Promise.all([
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
    if (onlyIfChanged && state.repository.getAppointmentsSignatureFrom) {
      const signature = await state.repository.getAppointmentsSignatureFrom(startDate);
      if (requestId !== logRefreshSequence || (!state.isOwner && state.repository.authSupported)) return true;
      if (signature === state.upcomingAppointmentsSignature) return true;
    }
    const appointments = await state.repository.listAppointmentsFrom(startDate);
    if (requestId !== logRefreshSequence || (!state.isOwner && state.repository.authSupported)) return true;
    state.upcomingAppointmentsSignature = buildAppointmentsSignature(appointments);
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

function buildAppointmentsSignature(appointments) {
  return appointments
    .map((appointment) => `${appointment.id}:${appointment.status}`)
    .sort()
    .join("|");
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
  if (els.voiceAppointmentControl) els.voiceAppointmentControl.hidden = !state.isOwner;
}

function renderOwnerControls() {
  if (els.ownerControls) els.ownerControls.hidden = !state.isOwner;
  if (!state.isOwner) return;
  if (els.availabilityToggle) els.availabilityToggle.hidden = false;
}

function renderDateStrip() {
  dateNavigation.render();
}

function getCalendarPageStart(selectedIndex) {
  return dateNavigation.getPageStart(selectedIndex);
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
  els.appointmentList.querySelectorAll("[data-create-staff]").forEach((button) => {
    button.addEventListener("click", () => openManualBookingDialog(null, {
      staffKey: button.dataset.createStaff,
      startMinutes: Number(button.dataset.createStart),
    }));
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
  const appointments = sortUpcomingAppointments(state.upcomingAppointments);
  if (els.upcomingLogCount) els.upcomingLogCount.textContent = appointments.length;
  if (els.upcomingLogTitle) {
    els.upcomingLogTitle.textContent = t("admin.upcomingLog");
  }
  els.upcomingLogList.innerHTML = renderBookingLog({
    appointments,
    emptyLabel: t("admin.emptyUpcomingLog"),
    renderAppointment: renderLogAppointment,
  });
  els.upcomingLogList.querySelectorAll("[data-log-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelAppointmentById(button.dataset.logCancel));
  });
  renderCollapseState();
}

function renderCollapseState() {
  if (els.upcomingLogList && els.logCollapseButton) {
    els.upcomingLogList.hidden = state.logCollapsed;
    els.logCollapseButton.innerHTML = renderCollapseIcon(state.logCollapsed);
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
  const appointmentLane = state.laneLayout.find((lane) => lane.laneKey === appointment.laneKey);
  const canCancel = state.accessRole !== "staff" || canEditLane(appointmentLane || {});
  return renderBookingLogAppointment({
    appointment,
    serviceLabel: getServiceAbbrev(service),
    canCancel,
    unnamedCustomer: t("admin.unnamedCustomer"),
    cancelLabel: t("admin.cancel"),
    cancelAriaLabel: t("admin.cancelBooking"),
  });
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
      await clearManualItem(lane, existing);
      playAppointmentDeletedSound();
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
    message: t("admin.cancelBookingMessage"),
    confirmLabel: t("admin.cancel"),
    cancelLabel: t("common.cancel"),
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

async function openManualBookingDialog(entry = null, preset = {}) {
  if (!els.bookingDialog || !state.isOwner) return;
  manualBookingController.entry = entry;
  const service = entry ? serviceForItem(entry) : null;
  const currentLane = entry ? state.laneLayout.find((lane) => lane.laneKey === entry.laneKey) : null;
  const staffGroups = groupLanesByStaff(state.laneLayout).filter((group) => (
    state.accessRole !== "staff" || group.staffId === state.accessStaffId
  ));
  els.bookingEmployee.innerHTML = staffGroups.map((group) => `<option value="${escapeAttribute(group.key)}">${escapeHtml(group.name)}</option>`).join("");
  const preferredStaffKey = currentLane?.staffKey || preset.staffKey || "";
  if (preferredStaffKey && staffGroups.some((group) => group.key === preferredStaffKey)) {
    els.bookingEmployee.value = preferredStaffKey;
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
    preferredStart: entry?.startMinutes ?? preset.startMinutes ?? null,
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
  els.bookingService.innerHTML = services.length
    ? services.map((service) => {
      const color = service.slotColor || service.color || "#e7ece8";
      return `<option value="${escapeAttribute(service.id)}" style="background-color:color-mix(in srgb, ${escapeAttribute(color)} 28%, white)">${escapeHtml(`${getServiceAbbrev(service)} · ${service.duration} Min.`)}</option>`;
    }).join("")
    : `<option value="">${escapeHtml(t("admin.chooseAvailableService"))}</option>`;
  if (services.some((service) => service.id === preferred)) els.bookingService.value = preferred;
  else if (services[0]) els.bookingService.value = services[0].id;
  els.bookingService.disabled = services.length === 0;
  updateManualServiceColor();
}

function updateManualServiceColor() {
  const service = findService(els.bookingService?.value);
  const color = service?.slotColor || service?.color;
  if (!els.bookingService) return;
  els.bookingService.style.backgroundColor = color
    ? `color-mix(in srgb, ${color} 32%, var(--theme-field))`
    : "var(--theme-field)";
}

function getManualServicesForStaff(staffKey) {
  return filterManualServicesForStaff({
    services: state.services,
    staffServiceKeys: state.staffServiceKeys,
    staffKey,
  });
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
  const requestId = manualBookingController.nextRequest();
  const submit = els.manualBookingForm?.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  if (!els.bookingDate?.value) {
    manualBookingController.context = null;
    if (els.bookingStart) {
      els.bookingStart.innerHTML = `<option value="">${escapeHtml(t("admin.chooseTime"))}</option>`;
      els.bookingStart.disabled = true;
    }
    if (els.bookingFormMessage) els.bookingFormMessage.textContent = t("admin.chooseDateRequired");
    return;
  }
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = t("admin.checkingTimes");
  try {
    const context = await fetchManualContext(els.bookingDate.value);
    if (!manualBookingController.isCurrentRequest(requestId)) return;
    manualBookingController.context = context;
    renderManualServiceOptions({ preferred: preferredServiceId });
    const hasPreferredStart = preferredStart !== null && preferredStart !== "" && Number.isFinite(Number(preferredStart));
    renderManualBookingTimes({ preferred: preferredStart, filterByService: !hasPreferredStart || Boolean(preferredServiceId) });
    if (hasPreferredStart && !preferredServiceId && els.bookingStart?.value) {
      renderManualServiceOptions({ filterByTime: true });
    }
    updateManualSubmitState();
  } catch (error) {
    if (!manualBookingController.isCurrentRequest(requestId)) return;
    manualBookingController.context = null;
    if (els.bookingFormMessage) els.bookingFormMessage.textContent = t("admin.loadTimesFailed", { message: error.message });
  }
}

function canPlaceManualEditorService(service, startMinutes) {
  if (!service || !manualBookingController.context || !Number.isFinite(startMinutes)) return false;
  return canPlaceManualEditorServiceInContext({
    service,
    startMinutes,
    ...manualBookingController.context,
    staffLanes: getSelectedStaffLanes(),
    laneLayout: state.laneLayout,
    excludedEntryId: manualBookingController.entry?.id || manualBookingController.entry?.scheduleEntryId || "",
  });
}

function canPlaceManualEditorServiceOnLane(service, startMinutes, lane, context = manualBookingController.context) {
  if (!service || !lane || !context) return false;
  return canPlaceManualEditorServiceOnLaneInContext({
    service,
    startMinutes,
    lane,
    appointments: context.appointments,
    manualEntries: context.manualEntries,
    laneLayout: state.laneLayout,
    excludedEntryId: manualBookingController.entry?.id || manualBookingController.entry?.scheduleEntryId || "",
  });
}

function renderManualBookingTimes({ preferred = null, filterByService = true } = {}) {
  if (!els.bookingStart || !manualBookingController.context) return;
  const selectedService = findService(els.bookingService?.value);
  const services = filterByService && selectedService ? [selectedService] : getManualEditorServices();
  const starts = getAvailableManualStarts({
    services,
    daySettings: manualBookingController.context.daySettings,
    slotStep: SLOT_STEP,
    canPlace: canPlaceManualEditorService,
  });
  els.bookingStart.innerHTML = `<option value="">${escapeHtml(t("admin.chooseTime"))}</option>${starts.map((minute) => `<option value="${minute}">${escapeHtml(formatMinutes(minute))}</option>`).join("")}`;
  if (starts.includes(Number(preferred))) els.bookingStart.value = String(preferred);
  els.bookingStart.disabled = starts.length === 0;
  if (els.bookingFormMessage) els.bookingFormMessage.textContent = starts.length ? "" : t("admin.noMatchingTime");
}

function updateManualSubmitState() {
  const submit = els.manualBookingForm?.querySelector('[type="submit"]');
  const service = findService(els.bookingService?.value);
  const startMinutes = Number(els.bookingStart?.value);
  const valid = Boolean(els.bookingDate?.value && els.bookingDate.checkValidity() && service && els.bookingStart?.value
    && canPlaceManualEditorService(service, startMinutes));
  if (submit) submit.disabled = !valid;
  if (valid && els.bookingFormMessage) els.bookingFormMessage.textContent = "";
}

async function submitManualBooking(event) {
  event.preventDefault();
  normalizeManualBookingDate();
  if (!els.bookingDate?.checkValidity()) {
    els.bookingDate?.reportValidity();
    return;
  }
  if (!els.bookingService?.value) {
    els.bookingFormMessage.textContent = t("admin.chooseAvailableService");
    return;
  }
  const service = findService(els.bookingService.value);
  const startMinutes = Number(els.bookingStart.value);
  const lane = canPlaceManualEditorService(service, startMinutes)
    ? findAvailableManualLane({
      staffLanes: getSelectedStaffLanes(),
      canPlaceOnLane: (candidate) => canPlaceManualEditorServiceOnLane(service, startMinutes, candidate),
    })
    : null;
  if (!lane) {
    els.bookingFormMessage.textContent = t("admin.timeNoLongerFree");
    renderManualBookingTimes({ filterByService: true });
    return;
  }
  const submit = els.manualBookingForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const isNewAppointment = !manualBookingController.entry;
    await saveManualService(
      lane.storageKey,
      startMinutes,
      service,
      manualBookingController.entry ? { scheduleEntryId: manualBookingController.entry.id || manualBookingController.entry.scheduleEntryId } : null,
      els.bookingNote?.value.trim() || "",
      els.bookingDate.value,
    );
    if (isNewAppointment) playAppointmentCreatedSound();
    els.bookingDialog.close();
    els.adminDateInput.value = els.bookingDate.value;
    const selectedIndex = state.dateOptions.findIndex((option) => option.date === els.bookingDate.value);
    if (selectedIndex >= 0) state.datePageStart = getCalendarPageStart(selectedIndex);
    await refreshDateOptions();
    await refreshDayData();
    showToast(t("admin.appointmentSaved", { service: getServiceAbbrev(service), time: formatMinutes(startMinutes), staff: lane.staffShortName || lane.staffName, action: t(manualBookingController.entry ? "admin.updated" : "admin.created") }));
    manualBookingController.clear();
  } catch (error) {
    els.bookingFormMessage.textContent = "";
    showToast(t("admin.saveFailed", { message: error.message }), "error");
  } finally {
    submit.disabled = false;
  }
}

function normalizeManualBookingDate() {
  if (!els.bookingDate?.value) return;
  if (els.bookingDate.min && els.bookingDate.value < els.bookingDate.min) {
    els.bookingDate.value = els.bookingDate.min;
  } else if (els.bookingDate.max && els.bookingDate.value > els.bookingDate.max) {
    els.bookingDate.value = els.bookingDate.max;
  }
}

function openScheduleDetail(id, kind) {
  detailController.open(id, kind);
}

function editSelectedManualEntry(entry) {
  if (!entry) {
    showToast(t("admin.appointmentMissing"), "error");
    return;
  }
  detailController.close();
  openManualBookingDialog(entry);
}

async function deleteSelectedManualEntry(entry) {
  const entryId = entry?.id || entry?.scheduleEntryId;
  if (!entryId) return;
  try {
    await state.repository.deleteManualScheduleEntry(entryId);
    playAppointmentDeletedSound();
    detailController.close();
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
    availabilityController.closeTimePanel();
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

function getCustomerNameSizeClass(name) {
  if (name.length > 22) return "customer-name customer-name-compact";
  if (name.length > 14) return "customer-name customer-name-long";
  return "customer-name";
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
