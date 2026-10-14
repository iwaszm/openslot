import {
  findAvailableLane as findAvailableScheduleLane,
  getServiceOccupiedMinutes,
  normalizeLaneLayout as normalizeScheduleLaneLayout,
} from "./src/booking/scheduling.mjs";
import { createSupabaseBookingRepository } from "./src/booking/supabase-booking-repository.mjs";
import { createLocalBookingRepository } from "./src/booking/local-booking-repository.mjs";
import { canSubmitBooking, getBookingErrorKey, validateCustomerValues } from "./src/booking/booking-validation.mjs";
import {
  buildBookingSlots,
  getNoSlotMessageKey,
  validateBookingCandidate,
} from "./src/booking/booking-availability.mjs";
import {
  createBookingResultHtml,
  createBookingSummaryHtml,
  createDateStripHtml,
  createSalonHoursHtml,
  createServiceCatalogHtml,
  createSlotsHtml,
  createWeeklyHoursHtml,
} from "./src/booking/booking-view.mjs";
import {
  buildStaffOptions,
  groupServicesByCategory as groupCatalogServices,
  listActiveServices,
} from "./src/booking/service-catalog.mjs";
import {
  buildDateRange as buildBookingDateRange,
  getBerlinHolidayName,
  getCalendarWeekStartIndex as getBookingCalendarWeekStartIndex,
  getInitialBookingDate as findInitialBookingDate,
  isBusinessDay as checkBusinessDay,
  normalizeDaySettings as normalizeBookingDaySettings,
  toDateInputValue,
} from "./src/booking/calendar.mjs";
import { formatMinutes, parseTime } from "./src/core/time.mjs";
import { createBookingState } from "./src/booking/booking-state.mjs";
import { createBookingTurnstileController } from "./src/booking/turnstile-controller.mjs";
import { createBookingSubmissionController } from "./src/booking/booking-submission.mjs?v=20261012-booking-complete-1";

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
const LOCAL_STORAGE_NAMESPACE = window.OPENSLOT_LOCAL_STORAGE_NAMESPACE || "openslot.barber.mvp";
const STORAGE_KEY = `${LOCAL_STORAGE_NAMESPACE}.appointments`;
const SETTINGS_KEY = `${LOCAL_STORAGE_NAMESPACE}.day-settings`;
const BLOCKS_KEY = `${LOCAL_STORAGE_NAMESPACE}.blocked-slots`;
const SERVICES_KEY = `${LOCAL_STORAGE_NAMESPACE}.services`;
const FLEXIBLE_SLOTS_KEY = `${LOCAL_STORAGE_NAMESPACE}.flexible-staff-slots`;
const LEGACY_SERVICE_IDS = new Set(["haircut", "color", "perm"]);

const state = createBookingState({
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  laneLayout: createDefaultLaneLayout(), services: DEFAULT_SERVICES,
  requireServiceSelection: requiresServiceSelection(),
});

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
function getServiceName(service) {
  const language = window.OpenSlotI18n?.language || "de";
  const databaseName = language === "en" ? service.nameEn : language === "zh" ? service.nameZh : service.name;
  if (databaseName) return databaseName;
  return window.OpenSlotI18n?.serviceName({ ...service, id: stripSalonPrefix(service.id) }) || service.name;
}

function getServiceCategoryName(service, category) {
  const language = window.OpenSlotI18n?.language || "de";
  const databaseName = language === "en" ? service?.categoryNameEn : language === "zh" ? service?.categoryNameZh : service?.categoryName;
  if (databaseName) return databaseName;
  const key = `service.category.${category}`;
  const translated = t(key);
  return translated === key ? SERVICE_CATEGORY_LABELS[category] || t("booking.serviceLegend") : translated;
}

function setFormMessage(message) {
  state.formMessageRenderer = typeof message === "function" ? message : null;
  els.formMessage.textContent = state.formMessageRenderer ? state.formMessageRenderer() : message;
}

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

const turnstileController = createBookingTurnstileController({
  form: els.bookingForm,
  widget: els.turnstileWidget,
  onMissingToken: () => setFormMessage(() => t("customer.securityRequired")),
  onReset: updateSubmitState,
});
const submissionController = createBookingSubmissionController({
  elements: { form: els.bookingForm, date: els.dateInput, gender: els.genderInput },
  state,
  dependencies: {
    activeServices, buildSlots, formatError: getBookingErrorMessage,
    getLanguage: () => window.OpenSlotI18n?.language || "de",
    getNoSlotMessage, getOccupiedMinutes: getServiceOccupiedMinutes, getSelectedService,
    parseTime, refreshDay: refreshDayData, renderResult: renderBookingResult,
    renderServices, renderSlots, requireServiceSelection: requiresServiceSelection, setMessage: setFormMessage,
    t, turnstile: turnstileController, updateSubmit: updateSubmitState,
    validateCustomerFields, validateSlot: validateBookingSlot,
  },
});

window.onOpenSlotTurnstileChange = () => {
  updateSubmitState();
};

init();

async function init() {
  try {
    els.dateInput.value = getInitialBookingDate();
    els.dateInput.min = toDateInputValue(new Date());
    state.repository = createRepository();
    bindEvents();
    await refreshServices();
    await refreshGalleryImages();
    await refreshLaneLayout();
    await refreshStaffServices();
    await refreshDateOptions();
    await refreshDayData();
    if (window.OPENSLOT_RUNTIME?.dataSource === "local" && window.OpenSlotLocalRepository) {
      window.OpenSlotLocalRepository.subscribe("services", async () => {
        await refreshServices();
        await refreshDayData();
      });
      window.OpenSlotLocalRepository.subscribe("staff-services", async () => {
        await refreshStaffServices();
        await refreshDayData();
      });
    }
  } finally {
    document.body.classList.remove("booking-hydrating");
    document.body.removeAttribute("aria-busy");
  }
}

async function refreshGalleryImages() {
  let images = [];
  try {
    images = await state.repository.listGalleryImages?.() || [];
  } catch (_error) {
    images = [];
  }
  window.dispatchEvent(new CustomEvent("openslot:gallery-update", { detail: { images } }));
}

function bindEvents() {
  els.bookingForm.addEventListener("submit", submissionController.submit);
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
  if (requiresServiceSelection()) {
    window.addEventListener("openslot:clear-service-selection", () => {
      state.selectedServiceId = "";
      state.selectedSlot = "";
      renderServices();
      render();
    });
  }
  window.addEventListener("openslot:employee-change", (event) => {
    state.selectedStaffKey = event.detail?.staffKey || "any";
    state.selectedSlot = "";
    render();
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
    if (state.formMessageRenderer) els.formMessage.textContent = state.formMessageRenderer();
    render();
    renderServices();
    renderDateStrip();
  });
}

function createRepository() {
  const config = window.OPENSLOT_SUPABASE || {};
  const forcedLocal = window.OPENSLOT_RUNTIME?.dataSource === "local";
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isLocalPreview = isLocalHost && new URLSearchParams(window.location.search).has("demo");
  const hasSupabase = Boolean(window.supabase && config.url && config.anonKey);
  if (forcedLocal || isLocalPreview || !hasSupabase) {
    state.storageStatusKey = "common.localDemo";
    if (els.storageStatus) els.storageStatus.textContent = t("common.localDemo");
    return createLocalRepository();
  }

  const client = window.supabase.createClient(config.url, config.anonKey);
  state.storageStatusKey = "common.supabase";
  if (els.storageStatus) els.storageStatus.textContent = t("common.supabase");
  return createSupabaseBookingRepository({
    client,
    salonSlug: getCurrentSalonSlug(),
    defaultServices: DEFAULT_SERVICES,
    createDefaultDaySettings,
    normalizeDaySettings,
    onSalonLoaded: (salon) => { state.salon = salon; },
  });
}

function requiresServiceSelection() {
  return Boolean(window.OPENSLOT_REQUIRE_SERVICE_SELECTION || window.OPENSLOT_TEMPLATE_REQUIRE_SELECTION);
}

function shouldShowUnavailableSlots() {
  return Boolean(window.OPENSLOT_SHOW_UNAVAILABLE_SLOTS || window.OPENSLOT_TEMPLATE_SHOW_UNAVAILABLE);
}

async function refreshServices() {
  try {
    state.services = await state.repository.listServices();
    const selected = state.services.find((service) => service.id === state.selectedServiceId);
    if (!selected?.isActive || selected.acceptsOnline === false) {
      state.selectedServiceId = requiresServiceSelection() ? "" : activeServices()[0]?.id || "";
    }
  } catch (error) {
    state.services = DEFAULT_SERVICES;
    setFormMessage(() => t("customer.servicesLoadFailed"));
  }
  renderServices();
}

async function refreshLaneLayout() {
  try {
    const layout = await state.repository.listLaneLayout();
    state.laneLayout = normalizeLaneLayout(layout);
  } catch (_error) {
    state.laneLayout = state.repository.requiresTurnstile ? [] : createDefaultLaneLayout();
  }
  publishStaffOptions();
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
  publishStaffOptions();
  renderServices();
}

function publishStaffOptions() {
  const staff = buildStaffOptions({
    laneLayout: state.laneLayout,
    services: state.services,
    staffServiceKeys: state.staffServiceKeys,
  });
  window.dispatchEvent(new CustomEvent("openslot:staff-update", { detail: { staff } }));
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
    const [appointments, daySettings, scheduleRecords] = await Promise.all([
      state.repository.listAppointments(date),
      state.repository.getDaySettings(date),
      state.repository.listSchedule(date),
    ]);
    state.appointments = appointments;
    state.daySettings = daySettings;
    state.scheduleRecords = scheduleRecords;
  } catch (error) {
    setFormMessage(() => t("customer.scheduleLoadFailed"));
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
  document.title = `${state.salon.name || t("salon.name")} · Termin buchen`;
  document.documentElement.dataset.shopTheme = state.salon.theme_preset || "lime";
  const languageSwitcher = document.querySelector(".language-switcher");
  if (languageSwitcher && Array.isArray(state.salon.languages)) {
    state.salon.languages.forEach((language) => {
      const button = languageSwitcher.querySelector(`[data-language-option="${language}"]`);
      if (button) languageSwitcher.append(button);
    });
  }
}

function renderOpeningHours() {
  if (state.salon?.opening_hours) {
    const rows = normalizeOpeningHours(state.salon.opening_hours);
    els.openingHours.innerHTML = createSalonHoursHtml({
      rows,
      todayKey: getOpeningHoursTodayKey(),
      isClosed: isClosedHours,
    });
    return;
  }
  const today = getWeeklyRule(new Date());
  els.openingHours.innerHTML = createWeeklyHoursHtml({
    today,
    days: WEEKLY_HOURS,
    translate: t,
    formatHours: formatWeeklyHours,
  });
}

function normalizeOpeningHours(openingHours) {
  return {
    monday: { label: t("salon.day.monday"), hours: localizeOpeningHours(openingHours.monday, "10:00-18:00") },
    tuesday: { label: t("salon.day.tuesday"), hours: localizeOpeningHours(openingHours.tuesday, "10:00-18:00") },
    wednesday: { label: t("salon.day.wednesday"), hours: localizeOpeningHours(openingHours.wednesday, "10:00-18:00") },
    thursday: { label: t("salon.day.thursday"), hours: localizeOpeningHours(openingHours.thursday, "10:00-18:00") },
    friday: { label: t("salon.day.friday"), hours: localizeOpeningHours(openingHours.friday, "10:00-18:00") },
    saturday: { label: t("salon.day.saturday"), hours: localizeOpeningHours(openingHours.saturday, "10:00-17:00") },
    sunday: { label: t("salon.day.sunday"), hours: localizeOpeningHours(openingHours.sunday, t("salon.closed")) },
  };
}

function localizeOpeningHours(value, fallback) {
  if (!value) return fallback;
  return isClosedHours(value) ? t("salon.closed") : value;
}

function isClosedHours(value) {
  return ["closed", "geschlossen", "休息"].includes(String(value || "").trim().toLowerCase());
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
  els.serviceOptions.innerHTML = createServiceCatalogHtml({
    groups: serviceGroups,
    services,
    selectedServiceId: state.selectedServiceId,
    requireSelection: requiresServiceSelection(),
    translate: t,
    getServiceName,
    formatPrice: formatServicePrice,
  });
}

function groupServicesByCategory(services) {
  return groupCatalogServices({
    services,
    categoryOrder: SERVICE_CATEGORY_ORDER,
    categoryLabels: SERVICE_CATEGORY_LABELS,
    getCategoryLabel: getServiceCategoryName,
    fallbackLabel: t("booking.serviceLegend"),
  });
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
  els.dateStrip.innerHTML = createDateStripHtml({
    dateOptions: state.dateOptions,
    selectedDate: els.dateInput.value,
    monthLabel,
    formatDateLabel: formatDateButtonLabel,
  });

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
    els.slotGrid.innerHTML = requiresServiceSelection() ? "" : `<div class="empty-state compact-empty">${t("customer.noServices")}</div>`;
    return;
  }

  const allSlots = buildSlots(els.dateInput.value, service);
  const visibleSlots = shouldShowUnavailableSlots()
    ? allSlots
    : allSlots.filter((slot) => slot.available);
  if (visibleSlots.length === 0) {
    els.slotGrid.innerHTML = `<div class="empty-state compact-empty">${getNoSlotMessage(allSlots)}</div>`;
    renderSelectedSummaries();
    return;
  }

  els.slotGrid.innerHTML = createSlotsHtml({
    slots: visibleSlots,
    selectedSlot: state.selectedSlot,
    translate: t,
  });

  els.slotGrid.querySelectorAll(".slot-button.available").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSlot = button.dataset.slot;
      setFormMessage("");
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
  els.submitButton.disabled = !canSubmitBooking({
    hasService: Boolean(getSelectedService()),
    date: els.dateInput.value,
    slot: state.selectedSlot,
    requiresTurnstile: needsTurnstile,
    turnstileToken: turnstileController.getToken({ silent: true }),
  });
}

function renderBookingSummary() {
  const service = getSelectedService();
  if (!service) return "";
  const serviceName = getServiceName(service);
  const serviceMeta = t("customer.serviceMeta", { duration: service.duration, price: formatServicePrice(service) });
  const dateLabel = formatSelectedDateLabel(els.dateInput.value);
  const timeLabel = state.selectedSlot ? formatSelectedTimeRange(service) : t("booking.summaryNoTime");
  return createBookingSummaryHtml({ serviceName, serviceMeta, dateLabel, timeLabel });
}

function formatSelectedTimeRange(service) {
  const startMinutes = parseTime(state.selectedSlot);
  return `${formatMinutes(startMinutes)}-${formatMinutes(startMinutes + service.duration)}`;
}

function renderBookingResult(emailStatus = "sent") {
  els.bookingResult.hidden = false;
  els.bookingResult.innerHTML = createBookingResultHtml({
    successText: t("customer.success"),
    emailText: emailStatus === "sent" ? t("customer.checkEmail") : "",
  });
}

function getCurrentSalonSlug() {
  const segment = window.location.pathname.split("/").filter(Boolean)[0];
  if (!segment || segment.endsWith(".html")) return "lisa";
  return decodeURIComponent(segment).trim() || "lisa";
}

function createLocalRepository() {
  return createLocalBookingRepository({
    storage: localStorage,
    cryptoApi: crypto,
    localDataRepository: window.OpenSlotLocalRepository,
    keys: {
      appointments: STORAGE_KEY,
      daySettings: SETTINGS_KEY,
      blockedSlots: BLOCKS_KEY,
      services: SERVICES_KEY,
      flexibleStaffSlots: FLEXIBLE_SLOTS_KEY,
    },
    defaultServices: DEFAULT_SERVICES,
    legacyServiceIds: LEGACY_SERVICE_IDS,
    slotStep: SLOT_STEP,
    getLaneLayout: () => state.laneLayout,
    getServices: () => state.services,
    findAvailableLane,
    createDefaultLaneLayout,
    createDefaultDaySettings,
    normalizeDaySettings,
    normalizeServiceId: stripSalonPrefix,
  });
}

function buildSlots(date, service) {
  const schedule = state.scheduleRecords.length > 0 ? state.scheduleRecords : state.appointments;
  return buildBookingSlots({
    date,
    service,
    daySettings: state.daySettings,
    schedule,
    slotStep: SLOT_STEP,
    isPastSlot,
    findAvailableLane,
  }).map((slot) => ({
    ...slot,
    reason: slot.reasonKey ? t(slot.reasonKey) : "",
  }));
}

function getNoSlotMessage(slots) {
  return t(getNoSlotMessageKey({
    hasService: Boolean(getSelectedService()),
    daySettings: state.daySettings,
    slots,
  }));
}

function validateBookingSlot(appointment) {
  const schedule = state.scheduleRecords.length > 0 ? state.scheduleRecords : state.appointments;
  const messageKey = validateBookingCandidate({
    appointment,
    daySettings: state.daySettings,
    schedule,
    findAvailableLane,
  });
  return messageKey ? t(messageKey) : "";
}

function getSelectedService() {
  if (requiresServiceSelection() && !state.selectedServiceId) return null;
  return state.services.find((service) => service.id === state.selectedServiceId) || activeServices()[0];
}

function activeServices() {
  return listActiveServices({
    services: state.services,
    laneLayout: state.laneLayout,
    staffServiceKeys: state.staffServiceKeys,
    defaultServiceOrder: SERVICE_ORDER,
    normalizeServiceId: stripSalonPrefix,
  });
}

function findAvailableLane(candidate, schedule) {
  return findAvailableScheduleLane({
    candidate,
    schedule,
    laneLayout: state.laneLayout,
    selectedStaffKey: state.selectedStaffKey,
    staffServiceKeys: state.staffServiceKeys,
    slotStep: SLOT_STEP,
  });
}

function createDefaultLaneLayout() {
  const isDemoSalon = getCurrentSalonSlug() === "demo";
  const laneKeys = isDemoSalon ? ["a", "b", "c", "d"] : ["a", "b"];
  return laneKeys.map((laneKey, index) => ({
    laneKey,
    laneSortOrder: (index % 2) + 1,
    staffKey: index < 2 ? "default" : "tony",
    staffName: index < 2 ? "Linda" : "Tony",
    staffShortName: index < 2 ? "L" : "T",
    staffColor: index < 2 ? "#f8c7ff" : "#b8d9d0",
    staffSortOrder: index < 2 ? 1 : 2,
  }));
}

function normalizeLaneLayout(rows) {
  return normalizeScheduleLaneLayout(rows, createDefaultLaneLayout());
}

function formatServicePrice(service) {
  const amount = Number(service.price).toFixed(0);
  const language = window.OpenSlotI18n?.language || "de";
  if (language === "zh") return service.priceFrom ? `€${amount} 起` : `€${amount}`;
  if (language === "en") return service.priceFrom ? `from €${amount}` : `€${amount}`;
  return service.priceFrom ? `ab ${amount} €` : `${amount} €`;
}

function createDefaultDaySettings(date) {
  const holidayName = getBerlinHolidayName(date);
  return normalizeDaySettings({
    date,
    openMinutes: DEFAULT_OPEN_MINUTES,
    closeMinutes: DEFAULT_CLOSE_MINUTES,
    isBlockedDay: Boolean(holidayName),
    holidayName,
    isPublicHoliday: Boolean(holidayName),
    hasManualOverride: false,
  });
}

function normalizeDaySettings(settings) {
  const weeklyRule = getWeeklyRule(new Date(`${settings.date}T00:00:00`));
  return normalizeBookingDaySettings(settings, weeklyRule, {
    openMinutes: DEFAULT_OPEN_MINUTES,
    closeMinutes: DEFAULT_CLOSE_MINUTES,
  });
}

function isBusinessDay(settings) {
  const weeklyRule = getWeeklyRule(new Date(`${settings.date}T00:00:00`));
  return checkBusinessDay(settings, weeklyRule);
}

function buildDateRange() {
  return buildBookingDateRange(new Date(), DATE_RANGE_DAYS);
}

function getWeeklyRule(date) {
  const localHours = window.OpenSlotLocalRepository?.listOpeningHours?.();
  const localRule = localHours?.find((day) => day.day === date.getDay());
  if (localRule) return { index: localRule.day, key: WEEKLY_HOURS.find((day) => day.index === localRule.day)?.key, openMinutes: localRule.isOpen ? localRule.openMinutes : null, closeMinutes: localRule.isOpen ? localRule.closeMinutes : null };
  return WEEKLY_HOURS.find((day) => day.index === date.getDay()) || WEEKLY_HOURS[0];
}

function formatDateButtonLabel(date) {
  const lang = window.OpenSlotI18n?.language || "zh";
  const locale = lang === "zh" ? "zh-CN" : lang === "de" ? "de-DE" : "en-US";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return {
    weekday,
    day: lang === "zh" ? String(date.getDate()) : new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
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

async function scrollDateStrip(direction) {
  let dateRow = els.dateStrip?.querySelector(".date-row");
  if (!dateRow) return;
  const buttons = [...dateRow.querySelectorAll(".date-button")];
  if (buttons.length === 0) return;
  const isPortraitPager = window.matchMedia("(orientation: portrait) and (max-width: 1180px)").matches;
  const configuredPageSize = Number(window.OPENSLOT_DATE_PAGE_SIZE ?? window.OPENSLOT_TEMPLATE_DATE_PAGE_SIZE);
  const pageSize = Number.isFinite(configuredPageSize) && configuredPageSize > 0
    ? Math.min(configuredPageSize, buttons.length)
    : isPortraitPager ? Math.min(7, buttons.length) : getVisibleDateCount(dateRow, buttons);
  const currentIndex = getDateRowStartIndex(dateRow, buttons);
  const targetIndex = getBookingCalendarWeekStartIndex(
    buttons.map((button) => button.dataset.date),
    currentIndex,
    direction,
    pageSize,
  );
  if (targetIndex === currentIndex) return;

  // Let the current strip finish its page movement before a data refresh replaces it.
  const usesFixedDatePaging = Boolean(window.OPENSLOT_DATE_PAGING || window.OPENSLOT_TEMPLATE_DATE_PAGING);
  if (usesFixedDatePaging) {
    scrollDateRowToIndex(dateRow, targetIndex);
    await new Promise((resolve) => window.setTimeout(resolve, 190));
  }

  const firstSelectable = buttons.slice(targetIndex, targetIndex + pageSize).find((button) => !button.disabled);
  if (firstSelectable && firstSelectable.dataset.date !== els.dateInput.value) {
    els.dateInput.value = firstSelectable.dataset.date;
    state.selectedSlot = "";
    renderSelectedSummaries();
    await refreshDayData();
    dateRow = els.dateStrip?.querySelector(".date-row");
  }

  if (dateRow) {
    scrollDateRowToIndex(dateRow, targetIndex, usesFixedDatePaging ? "auto" : "smooth");
  }
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

function scrollDateRowToIndex(dateRow, index, behavior = "smooth") {
  const buttons = [...dateRow.querySelectorAll(".date-button")];
  const firstButton = buttons[0];
  const targetButton = buttons[index];
  if (!firstButton || !targetButton) return;
  dateRow.scrollTo({ left: targetButton.offsetLeft - firstButton.offsetLeft, behavior });
}

function scrollServiceStrip(direction) {
  const serviceRow = els.serviceOptions?.querySelector(".service-carousel");
  if (!serviceRow) return;
  const groups = [...serviceRow.querySelectorAll(".service-group")];
  if (groups.length < 2) return;
  const columnStep = groups[1].offsetLeft - groups[0].offsetLeft;
  if (columnStep <= 0) return;
  const gap = Number.parseFloat(getComputedStyle(serviceRow).columnGap) || 0;
  const visibleColumns = Math.max(1, Math.round((serviceRow.clientWidth + gap) / columnStep));
  const maxStartIndex = Math.max(0, groups.length - visibleColumns);
  const currentIndex = Math.round(serviceRow.scrollLeft / columnStep);
  const targetIndex = Math.max(0, Math.min(maxStartIndex, currentIndex + direction * 2));
  const targetLeft = groups[targetIndex].offsetLeft - groups[0].offsetLeft;
  serviceRow.scrollTo({ left: targetLeft, behavior: "smooth" });
}

function resetPageHorizontalScroll() {
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;
  window.scrollTo(0, window.scrollY);
}

function stripSalonPrefix(id) {
  return String(id || "").replace(/^(lisa|demo)_/, "");
}

function getInitialBookingDate() {
  return findInitialBookingDate({
    now: new Date(),
    days: DATE_RANGE_DAYS,
    slotStep: SLOT_STEP,
    getWeeklyRule,
  });
}

function isPastSlot(date, startMinutes) {
  const today = toDateInputValue(new Date());
  if (date !== today) return false;
  const now = new Date();
  return startMinutes <= now.getHours() * 60 + now.getMinutes();
}

function getBookingErrorMessage(error) {
  return t(getBookingErrorKey(error));
}

function validateCustomerFields() {
  const fields = [els.customerName, els.customerPhone, els.customerEmail].filter(Boolean);
  fields.forEach((field) => field.setCustomValidity(""));
  const error = validateCustomerValues({
    name: els.customerName?.value,
    phone: els.customerPhone?.value,
    email: els.customerEmail?.value,
    emailValid: els.customerEmail?.checkValidity() ?? true,
  });
  if (!error) return null;
  const field = { name: els.customerName, phone: els.customerPhone, email: els.customerEmail }[error.field];
  field.setCustomValidity(t(error.messageKey));
  return field;
}
