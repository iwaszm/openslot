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

const state = {
  appointments: [],
  scheduleRecords: [],
  blockedSlots: [],
  daySettings: createDefaultDaySettings(toDateInputValue(new Date())),
  repository: null,
  services: DEFAULT_SERVICES,
  salon: null,
  laneLayout: createDefaultLaneLayout(),
  dateOptions: [],
  selectedServiceId: DEFAULT_SERVICES[0].id,
  selectedGender: DEFAULT_SERVICES[0].gender,
  selectedSlot: "",
  storageStatusKey: "common.detecting",
  formMessageRenderer: null,
};

const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
function getServiceName(service) {
  const language = window.OpenSlotI18n?.language || "de";
  const databaseName = language === "en" ? service.nameEn : language === "zh" ? service.nameZh : service.name;
  if (databaseName) return databaseName;
  return window.OpenSlotI18n?.serviceName({ ...service, id: stripSalonPrefix(service.id) }) || service.name;
}

function getServiceCategoryName(service, category) {
  const language = window.OpenSlotI18n?.language || "de";
  const databaseName = language === "en" ? service?.categoryNameEn : language === "zh" ? service?.categoryNameZh : "";
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
  await refreshLaneLayout();
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
  if (window.OPENSLOT_TEMPLATE_REQUIRE_SELECTION) {
    window.addEventListener("openslot:clear-service-selection", () => {
      state.selectedServiceId = "";
      state.selectedSlot = "";
      renderServices();
      render();
    });
  }
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
    setFormMessage(() => t("customer.servicesLoadFailed"));
  }
  renderServices();
}

async function refreshLaneLayout() {
  try {
    const layout = await state.repository.listLaneLayout();
    state.laneLayout = normalizeLaneLayout(layout);
  } catch (_error) {
    state.laneLayout = createDefaultLaneLayout();
  }
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
    const [appointments, daySettings, blockedSlots, scheduleRecords] = await Promise.all([
      state.repository.listAppointments(date),
      state.repository.getDaySettings(date),
      state.repository.listBlockedSlots(date),
      state.repository.listSchedule(date),
    ]);
    state.appointments = appointments;
    state.daySettings = daySettings;
    state.blockedSlots = blockedSlots;
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
          <div class="${isClosedHours(day.hours) ? "closed-day" : ""}">
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
  els.serviceOptions.innerHTML = `
    <div class="service-strip-shell">
      <button class="service-nav-button" type="button" data-service-scroll="-1" aria-label="${t("customer.previousServices")}">‹</button>
      <div class="service-carousel" aria-label="${t("booking.serviceLegend")}">
        ${serviceGroups.map((group) => `
          <section class="service-group" aria-label="${escapeHtml(group.label)}">
            <h3>${escapeHtml(group.label)}</h3>
            <div class="service-group-grid">
              ${group.services.map((service) => {
        const serviceGender = service.gender === "male" ? "male" : "female";
        const checked = service.id === state.selectedServiceId;
        const fallbackChecked = !window.OPENSLOT_TEMPLATE_REQUIRE_SELECTION && !state.selectedServiceId && service.id === services[0]?.id;
        return `
          <label class="service-card">
            <input type="radio" name="service" value="${service.id}" data-gender="${serviceGender}" ${checked || fallbackChecked ? "checked" : ""} />
            <strong>${escapeHtml(getServiceName(service))}</strong>
            <small>${t("customer.serviceMeta", { duration: service.duration, price: formatServicePrice(service) })}</small>
          </label>
        `;
        }).join("")}
            </div>
          </section>
        `).join("")}
      </div>
      <button class="service-nav-button" type="button" data-service-scroll="1" aria-label="${t("customer.nextServices")}">›</button>
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
        label: SERVICE_CATEGORY_LABELS[category] || t("booking.serviceLegend"),
        services: [],
      });
    }
    byCategory.get(category).services.push(service);
  });
  return Array.from(byCategory.values())
    .filter((group) => group.services.length > 0)
    .map((group) => ({
      ...group,
      label: getServiceCategoryName(group.services[0], group.category),
    }));
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
    els.slotGrid.innerHTML = window.OPENSLOT_TEMPLATE_REQUIRE_SELECTION ? "" : `<div class="empty-state compact-empty">${t("customer.noServices")}</div>`;
    return;
  }

  const allSlots = buildSlots(els.dateInput.value, service);
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
  const hasTurnstile = !needsTurnstile || Boolean(getTurnstileToken({ silent: true }));
  els.submitButton.disabled = !(getSelectedService() && els.dateInput.value && state.selectedSlot && hasTurnstile);
}

function renderBookingSummary() {
  const service = getSelectedService();
  if (!service) return "";
  const serviceName = getServiceName(service);
  const serviceMeta = t("customer.serviceMeta", { duration: service.duration, price: formatServicePrice(service) });
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
    const slots = service ? buildSlots(els.dateInput.value, service) : [];
    setFormMessage(() => {
      const currentService = getSelectedService();
      return getNoSlotMessage(currentService ? buildSlots(els.dateInput.value, currentService) : []);
    });
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
    occupiedMinutes: getServiceOccupiedMinutes(service, startMinutes),
    status: "confirmed",
  };

  await refreshDayData({ shouldRender: false });

  const slotError = validateBookingSlot(appointment);
  if (slotError) {
    setFormMessage(() => validateBookingSlot(appointment));
    state.selectedSlot = "";
    renderSlots();
    return;
  }

  if (state.repository.requiresTurnstile) {
    appointment.turnstileToken = getTurnstileToken();
    if (!appointment.turnstileToken) {
      setFormMessage(() => t("customer.securityRequired"));
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
    setFormMessage(mailMessage || "");
    await refreshDayData();
    renderServices();
  } catch (error) {
    resetTurnstile();
    setFormMessage(() => getBookingErrorMessage(error));
    await refreshDayData();
  }
}

function renderBookingResult() {
  els.bookingResult.hidden = false;
  els.bookingResult.innerHTML = `
    <strong>${t("customer.success")}</strong>
    <span>${t("customer.checkEmail")}</span>
  `;
}

function createSupabaseRepository(client) {
  const salonPromise = loadCurrentSalon(client);
  return {
    requiresTurnstile: true,
    async listServices() {
      const salon = await salonPromise;
      let { data, error } = await client
        .from("services")
        .select("id, name, name_en, name_zh, short_name, duration_minutes, booked_slots, price, price_from, is_active, category, category_name_en, category_name_zh, slot_color")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .order("id", { ascending: true });
      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("services")
          .select("id, name, short_name, duration_minutes, booked_slots, price, price_from, is_active, category, slot_color")
          .eq("salon_id", salon.id)
          .eq("is_active", true)
          .order("id", { ascending: true }));
      }
      if (error) throw error;
      return (data || []).map(fromSupabaseService);
    },
    async listLaneLayout() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_lanes")
        .select("lane_key, sort_order, salon_staff!inner(staff_key, sort_order, is_active)")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .eq("salon_staff.is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => ({
        laneKey: row.lane_key,
        laneSortOrder: Number(row.sort_order || 0),
        staffKey: row.salon_staff?.staff_key || "default",
        staffSortOrder: Number(row.salon_staff?.sort_order || 0),
      }));
    },
    async listAppointments(date) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_public_occupied_slots", {
        p_salon_slug: salon.slug,
        p_appointment_date: date,
      });
      if (error) throw error;
      return (data || []).map((row, index) => ({
        id: `occupied-${index}`,
        date,
        occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
        status: "confirmed",
      }));
    },
    async listSchedule(date) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_public_schedule", {
        p_salon_slug: salon.slug,
        p_appointment_date: date,
      });
      if (error) return this.listAppointments(date);
      return (data || []).map((row, index) => ({
        id: row.record_id || `schedule-${index}`,
        date,
        staffKey: row.staff_key || "default",
        laneKey: row.lane_key || null,
        startMinutes: timeValueToMinutes(row.covered_start),
        endMinutes: timeValueToMinutes(row.covered_end),
        occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
        kind: row.record_kind || "appointment",
        status: "confirmed",
      }));
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
      if (error) return t("customer.emailDeliveryFailed");
      const failed = data?.results?.find((result) => result.status === "failed");
      return failed ? t("customer.emailDeliveryFailed") : "";
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
        .select("id, block_date, start_time, end_time, reason, occupied_slots")
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
  if (!data) throw new Error("Der Salon konnte nicht gefunden werden.");
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
    async listLaneLayout() { return createDefaultLaneLayout(); },
    async listAppointments(date) {
      return loadLocalAppointments().filter((appointment) => appointment.date === date);
    },
    async listSchedule(date) {
      return buildLocalSchedule(date);
    },
    async createAppointment(appointment) {
      const appointments = loadLocalAppointments();
      const schedule = buildLocalSchedule(appointment.date);
      const laneKey = findAvailableLane(appointment, schedule);
      if (!laneKey) {
        throw new Error("Slot conflict");
      }
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      appointments.push({ ...appointment, id, laneKey });
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
    setFormMessage(() => t("customer.securityRequired"));
  }
  return token;
}

function resetTurnstile() {
  if (!els.turnstileWidget) return;
  window.turnstile?.reset?.(els.turnstileWidget);
  updateSubmitState();
}

function buildSlots(date, service) {
  if (state.daySettings.isBlockedDay) return [];
  const slots = [];
  for (let start = state.daySettings.openMinutes; start + service.duration <= state.daySettings.closeMinutes; start += SLOT_STEP) {
    const candidate = {
      date,
      startMinutes: start,
      endMinutes: start + service.duration,
      occupiedMinutes: getServiceOccupiedMinutes(service, start),
    };
    const isPast = isPastSlot(date, start);
    const schedule = state.scheduleRecords.length > 0 ? state.scheduleRecords : state.appointments;
    const ownerBlocked = hasOverlap(candidate, state.blockedSlots);
    const laneUnavailable = !findAvailableLane(candidate, schedule);
    const reason = getSlotReason({ isPast, ownerBlocked, laneUnavailable });
    slots.push({
      time: formatMinutes(start),
      available: !reason,
      isPast,
      reason,
    });
  }
  return slots;
}

function getSlotReason({ isPast, ownerBlocked, laneUnavailable }) {
  if (isPast) return t("customer.slotPast");
  if (ownerBlocked) return t("customer.slotBlocked");
  if (laneUnavailable) return t("customer.slotOccupied");
  return "";
}

function getNoSlotMessage(slots) {
  if (!getSelectedService()) return t("customer.noServices");
  if (state.daySettings.isBlockedDay) return t("customer.dayUnavailable");
  if (slots.length === 0) return t("customer.serviceOutsideHours");
  if (slots.every((slot) => slot.isPast)) return t("customer.noLaterToday");
  if (slots.every((slot) => slot.reason === t("customer.slotOccupied"))) return t("customer.allTimesOccupied");
  if (slots.every((slot) => slot.reason === t("customer.slotBlocked"))) return t("customer.allTimesBlocked");
  return t("customer.chooseAvailableTime");
}

function validateBookingSlot(appointment) {
  if (state.daySettings.isBlockedDay) return t("customer.dayUnavailable");
  if (appointment.startMinutes < state.daySettings.openMinutes || appointment.endMinutes > state.daySettings.closeMinutes) return t("customer.timeOutsideHours");
  const schedule = state.scheduleRecords.length > 0 ? state.scheduleRecords : state.appointments;
  if (hasOverlap(appointment, state.blockedSlots)) return t("customer.timeBlocked");
  if (!findAvailableLane(appointment, schedule)) return t("customer.noCompleteLane");
  return "";
}

function getSelectedService() {
  if (window.OPENSLOT_TEMPLATE_REQUIRE_SELECTION && !state.selectedServiceId) return null;
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
  const candidateRanges = getOccupiedRanges(candidate);
  return ranges.some((range) => (
    range.status !== "cancelled"
    && candidateRanges.some((candidateRange) => getOccupiedRanges(range).some((occupiedRange) => (
      candidateRange.startMinutes < occupiedRange.endMinutes
      && candidateRange.endMinutes > occupiedRange.startMinutes
    )))
  ));
}

function findAvailableLane(candidate, schedule) {
  const lane = state.laneLayout.find((candidateLane) => {
    const coveredConflict = schedule.some((item) => (
      item.status !== "cancelled"
      && item.laneKey === candidateLane.laneKey
      && Number.isFinite(item.startMinutes)
      && Number.isFinite(item.endMinutes)
      && candidate.startMinutes < item.endMinutes
      && candidate.endMinutes > item.startMinutes
    ));
    if (coveredConflict) return false;
    return !hasOverlap(candidate, schedule.filter((item) => (
      (item.staffKey || "default") === candidateLane.staffKey
    )));
  });
  return lane?.laneKey || null;
}

function buildLocalSchedule(date) {
  const appointments = allocateLocalAppointmentLanes(
    loadLocalAppointments().filter((item) => item.date === date && item.status !== "cancelled"),
  );
  const primary = loadLocalBlocks().filter((item) => item.date === date).map((item) => ({ ...item, laneKey: "a", kind: item.serviceId ? "manual" : "blocked" }));
  const overflow = groupLocalStaffSlots(date, "overflow", "b");
  const flexible = groupLocalStaffSlots(date, "flexible", "c");
  return [...appointments, ...primary, ...overflow, ...flexible];
}

function allocateLocalAppointmentLanes(appointments) {
  const lanes = Object.fromEntries(state.laneLayout.map((lane) => [lane.laneKey, []]));
  return appointments
    .slice()
    .sort((left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes)
    .map((appointment) => {
      const requested = String(appointment.laneKey || "").toLowerCase();
      const laneKeys = state.laneLayout.map((lane) => lane.laneKey);
      const laneKey = laneKeys.includes(requested)
        ? requested
        : (laneKeys.find((lane) => !lanes[lane].some((item) => appointment.startMinutes < item.endMinutes && appointment.endMinutes > item.startMinutes)) || laneKeys[laneKeys.length - 1]);
      const staffKey = state.laneLayout.find((lane) => lane.laneKey === laneKey)?.staffKey || "default";
      const allocated = { ...appointment, laneKey, staffKey };
      lanes[laneKey].push(allocated);
      return allocated;
    });
}

function createDefaultLaneLayout() {
  const laneKeys = getCurrentSalonSlug() === "liyong" ? ["a", "b"] : ["a", "b", "c"];
  return laneKeys.map((laneKey, index) => ({
    laneKey,
    laneSortOrder: index + 1,
    staffKey: "default",
    staffSortOrder: 1,
  }));
}

function normalizeLaneLayout(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return createDefaultLaneLayout();
  return rows
    .filter((row) => row.laneKey)
    .map((row) => ({
      laneKey: String(row.laneKey).toLowerCase(),
      laneSortOrder: Number(row.laneSortOrder || 0),
      staffKey: row.staffKey || "default",
      staffSortOrder: Number(row.staffSortOrder || 0),
    }))
    .sort((left, right) => left.staffSortOrder - right.staffSortOrder || left.laneSortOrder - right.laneSortOrder);
}

function groupLocalStaffSlots(date, staffKey, laneKey) {
  const slots = JSON.parse(localStorage.getItem(FLEXIBLE_SLOTS_KEY) || "[]")
    .filter((item) => item.date === date && (item.staffKey || "flexible") === staffKey);
  const groups = new Map();
  slots.forEach((item) => {
    if (!item.serviceId && item.isOpen !== false) return;
    const groupStart = item.serviceStartMinutes ?? item.startMinutes;
    const key = item.serviceId ? `${item.serviceId}:${groupStart}` : `blocked:${item.startMinutes}`;
    if (groups.has(key)) return;
    const service = state.services.find((entry) => entry.id === item.serviceId);
    groups.set(key, {
      ...item,
      laneKey,
      startMinutes: groupStart,
      endMinutes: groupStart + (service?.duration || SLOT_STEP),
      occupiedMinutes: service ? getServiceOccupiedMinutes(service, groupStart) : [item.startMinutes],
      kind: item.serviceId ? "manual" : "blocked",
      status: "confirmed",
    });
  });
  return [...groups.values()];
}

function getOccupiedRanges(item) {
  if (Array.isArray(item.occupiedMinutes) && item.occupiedMinutes.length > 0) {
    return item.occupiedMinutes.map((startMinutes) => ({ startMinutes, endMinutes: startMinutes + SLOT_STEP }));
  }
  return [{ startMinutes: item.startMinutes, endMinutes: item.endMinutes }];
}

function getServiceOccupiedMinutes(service, startMinutes) {
  const bookedSlots = Array.isArray(service.bookedSlots) && service.bookedSlots.length > 0
    ? service.bookedSlots
    : Array.from({ length: Math.ceil(service.duration / SLOT_STEP) }, (_, index) => index + 1);
  return bookedSlots.map((slotNumber) => startMinutes + ((slotNumber - 1) * SLOT_STEP));
}

function formatServicePrice(service) {
  const amount = Number(service.price).toFixed(0);
  const language = window.OpenSlotI18n?.language || "de";
  if (language === "zh") return service.priceFrom ? `€${amount} 起` : `€${amount}`;
  if (language === "en") return service.priceFrom ? `from €${amount}` : `€${amount}`;
  return service.priceFrom ? `ab ${amount} €` : `${amount} €`;
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
  const pageSize = isPortraitPager ? Math.min(7, buttons.length) : getVisibleDateCount(dateRow, buttons);
  const currentIndex = getDateRowStartIndex(dateRow, buttons);
  const currentPageStart = Math.floor(currentIndex / pageSize) * pageSize;
  const targetIndex = Math.max(0, Math.min(currentPageStart + (direction * pageSize), buttons.length - pageSize));

  const firstSelectable = buttons.slice(targetIndex, targetIndex + pageSize).find((button) => !button.disabled);
  if (firstSelectable && firstSelectable.dataset.date !== els.dateInput.value) {
    els.dateInput.value = firstSelectable.dataset.date;
    state.selectedSlot = "";
    renderSelectedSummaries();
    await refreshDayData();
    dateRow = els.dateStrip?.querySelector(".date-row");
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

function fromSupabaseService(row) {
  const fallback = DEFAULT_SERVICES.find((service) => service.id === stripSalonPrefix(row.id));
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en || "",
    nameZh: row.name_zh || "",
    shortName: row.short_name || row.name,
    duration: row.duration_minutes,
    bookedSlots: row.booked_slots || [],
    price: Number(row.price),
    priceFrom: Boolean(row.price_from),
    slotColor: row.slot_color || "",
    category: row.category || fallback?.category || "care",
    categoryNameEn: row.category_name_en || "",
    categoryNameZh: row.category_name_zh || "",
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
    occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
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
    occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
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

function timeValueToMinutes(value) {
  const text = String(value || "");
  return text.includes("T") ? dateToMinutes(text) : parseTime(text.slice(0, 5));
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
  if (/outside working hours/i.test(message)) return t("customer.timeOutsideHours");
  if (/This day is not available/i.test(message)) return t("customer.dayUnavailable");
  if (/blocked slot/i.test(message)) return t("customer.timeBlocked");
  if (/No complete service lane/i.test(message)) return t("customer.noCompleteLane");
  if (/prevent_double_booking|conflict|overlap/i.test(message)) return t("customer.bookingConflict");
  if (/Unknown or inactive service/i.test(message)) return t("customer.noServices");
  if (/Invalid (customer )?name/i.test(message)) return t("customer.nameNotNumeric");
  if (/Invalid phone/i.test(message)) return t("customer.phoneInvalid");
  if (/Invalid email/i.test(message)) return t("customer.emailInvalid");
  if (/Too many booking attempts/i.test(message)) return t("customer.tooManyAttempts");
  if (/Turnstile|captcha|token/i.test(message)) return t("customer.securityRequired");
  if (isConflictError(error)) return t("customer.bookingConflict");
  return t("customer.bookingFailed");
}

function validateCustomerName(value) {
  const name = String(value || "").trim();
  if (!name) return t("customer.nameRequired");
  if (name.length < 2) return t("customer.nameTooShort");
  if (name.length > 50) return t("customer.nameTooLong");
  if (/^\d+$/.test(name)) return t("customer.nameNotNumeric");
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
    els.customerPhone.setCustomValidity(t("customer.phoneRequired"));
    return els.customerPhone;
  }
  if (phone.length > 50) {
    els.customerPhone.setCustomValidity(t("customer.phoneTooLong"));
    return els.customerPhone;
  }
  if (!/^\+?[0-9][0-9\s()/.-]{5,}$/.test(phone)) {
    els.customerPhone.setCustomValidity(t("customer.phoneInvalid"));
    return els.customerPhone;
  }

  const email = els.customerEmail?.value.trim() || "";
  if (!email) {
    els.customerEmail.setCustomValidity(t("customer.emailRequired"));
    return els.customerEmail;
  }
  if (email.length > 50) {
    els.customerEmail.setCustomValidity(t("customer.emailTooLong"));
    return els.customerEmail;
  }
  if (!els.customerEmail.checkValidity()) {
    els.customerEmail.setCustomValidity(t("customer.emailInvalid"));
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
