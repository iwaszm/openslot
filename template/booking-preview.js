(() => {
  const tabs = document.querySelector("#serviceCategoryTabs");
  const services = document.querySelector("#serviceOptions");
  const toast = document.querySelector("#bookingToast");
  const message = document.querySelector("#formMessage");
  const result = document.querySelector("#bookingResult");
  const close = document.querySelector("#bookingToastClose");
  const form = document.querySelector("#bookingForm");
  const reservationDialog = document.querySelector("#reservationDialog");
  const reservationDialogEyebrow = document.querySelector("#reservationDialogEyebrow");
  const reservationDialogTitle = document.querySelector("#reservationDialogTitle");
  const reservationDialogMessage = document.querySelector("#reservationDialogMessage");
  const reservationDialogClose = document.querySelector("#reservationDialogClose");
  const dateStrip = document.querySelector("#dateStrip");
  const categoryPrev = document.querySelector("#serviceCategoryPrev");
  const categoryNext = document.querySelector("#serviceCategoryNext");
  const categoryIndicator = document.querySelector("#serviceCategoryIndicator");
  const employeePicker = document.querySelector(".employee-picker");
  const gallery = document.querySelector("#salonGallery");
  const galleryOpen = document.querySelector(".salon-gallery-open");
  const galleryImage = document.querySelector("#salonGalleryImage");
  const galleryCounter = document.querySelector("#salonGalleryCounter");
  const galleryPrev = document.querySelector(".salon-gallery-prev");
  const galleryNext = document.querySelector(".salon-gallery-next");
  const galleryClose = document.querySelector(".salon-gallery-close");
  let employeeOptions = [...document.querySelectorAll(".employee-option")];
  let staffRecords = [];
  let selectedServiceId = "";
  let eligibleEmployeeCount = 0;
  const languageMenu = document.querySelector(".language-menu");
  let activeCategory = "";
  let categoryPageStart = 0;
  let activeEmployee = "any";
  let dismissTimer;
  let reservationRequest = null;
  let reservationSyncTimer;
  let reservationGuardTimer;
  let galleryImages = [];
  let galleryIndex = 0;
  const lunarDateFormatter = new Intl.DateTimeFormat("zh-u-ca-chinese", {
    month: "numeric",
    day: "numeric",
    timeZone: "Europe/Berlin",
  });
  const lunarFestivals = new Map([
    ["1-1", "春节"], ["1-15", "元宵"], ["5-5", "端午"], ["7-7", "七夕"],
    ["8-15", "中秋"], ["9-9", "重阳"], ["12-8", "腊八"],
  ]);
  function applyShopProfile() {
    const profile = window.OpenSlotLocalRepository?.getShopProfile?.() || {
      name: "Studio Beispiel",
      address: "Musterstraße 12, 10115 Berlin",
      phone: "+49 30 000000",
      themePreset: "lime",
      themeColor: "#dfff2f",
    };
    document.getElementById("salonName").textContent = profile.name; document.getElementById("salonAddress").textContent = profile.address;
    const phone = document.getElementById("salonPhone"); phone.textContent = profile.phone; phone.href = `tel:${profile.phone.replace(/[^+\d]/g, "")}`;
    document.title = `${profile.name} · Termin buchen`;
    document.documentElement.dataset.shopTheme = profile.themePreset || "lime";
    document.documentElement.style.setProperty("--shop-accent", profile.themeColor || "#dfff2f");
    setGalleryImages(profile.galleryImages);
  }

  function setGalleryImages(images) {
    const fallback = document.body.dataset.galleryImages?.split(",") || [];
    galleryImages = (Array.isArray(images) && images.length ? images : fallback)
      .map((source) => String(source || "").trim())
      .filter(Boolean)
      .slice(0, 5);
    galleryOpen.hidden = galleryImages.length === 0;
  }

  function renderGalleryImage() {
    const source = galleryImages[galleryIndex];
    if (!source) return;
    galleryImage.src = source;
    galleryCounter.textContent = galleryImages.length > 1 ? `${galleryIndex + 1} / ${galleryImages.length}` : "";
    galleryPrev.hidden = galleryImages.length < 2;
    galleryNext.hidden = galleryImages.length < 2;
  }

  function moveGallery(direction) {
    galleryIndex = (galleryIndex + direction + galleryImages.length) % galleryImages.length;
    renderGalleryImage();
  }

  galleryOpen.addEventListener("click", () => {
    if (!galleryImages.length) return;
    galleryIndex = 0;
    renderGalleryImage();
    gallery.showModal();
  });
  galleryClose.addEventListener("click", () => gallery.close());
  galleryPrev.addEventListener("click", () => moveGallery(-1));
  galleryNext.addEventListener("click", () => moveGallery(1));
  gallery.addEventListener("click", (event) => {
    if (event.target === gallery) gallery.close();
  });
  gallery.addEventListener("keydown", (event) => {
    if (galleryImages.length < 2) return;
    if (event.key === "ArrowLeft") moveGallery(-1);
    if (event.key === "ArrowRight") moveGallery(1);
  });

  function syncCategories() {
    const groups = [...services.querySelectorAll(".service-group")];
    if (!groups.length) {
      tabs.replaceChildren();
      tabs.closest(".service-category-shell").hidden = true;
      return;
    }

    const labels = groups.map((group) => group.querySelector("h3")?.textContent.trim() || group.getAttribute("aria-label"));
    const categories = groups.map((group) => group.dataset.serviceCategory || "");
    if (!labels.includes(activeCategory)) {
      activeCategory = labels[0] || "";
      categoryPageStart = 0;
      tabs.scrollLeft = 0;
    }
    tabs.closest(".service-category-shell").hidden = false;
    tabs.replaceChildren(...labels.map((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "service-category-tab";
      button.id = `service-category-tab-${index}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `service-category-panel-${index}`);
      button.dataset.serviceCategory = categories[index];
      const text = document.createElement("span");
      text.textContent = label;
      button.append(text);
      button.addEventListener("click", () => {
        if (activeCategory === label) return;
        selectCategory(label);
        window.dispatchEvent(new Event("openslot:clear-service-selection"));
      });
      return button;
    }));
    groups.forEach((group, index) => {
      group.id = `service-category-panel-${index}`;
      group.setAttribute("role", "tabpanel");
      group.setAttribute("aria-labelledby", `service-category-tab-${index}`);
    });
    selectCategory(activeCategory);
  }

  function visibleCategoryCount() {
    return window.matchMedia("(orientation: portrait)").matches ? 3 : 4;
  }

  function positionCategoryIndicator() {
    const selected = tabs.querySelector('[role="tab"][aria-selected="true"]');
    if (!selected || !categoryIndicator) {
      if (categoryIndicator) categoryIndicator.style.opacity = "0";
      return;
    }
    const shellRect = tabs.closest(".service-category-track").getBoundingClientRect();
    const tabRect = selected.getBoundingClientRect();
    categoryIndicator.style.width = `${tabRect.width}px`;
    categoryIndicator.style.transform = `translateX(${tabRect.left - shellRect.left}px)`;
    categoryIndicator.style.opacity = "1";
  }

  function syncCategoryNavigation() {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const pageSize = visibleCategoryCount();
    const activeIndex = buttons.findIndex((button) => button.getAttribute("aria-selected") === "true");
    const lastPageStart = Math.max(0, Math.floor((buttons.length - 1) / pageSize) * pageSize);
    if (activeIndex >= 0 && (activeIndex < categoryPageStart || activeIndex >= categoryPageStart + pageSize)) {
      categoryPageStart = Math.floor(activeIndex / pageSize) * pageSize;
    }
    categoryPageStart = Math.min(categoryPageStart, lastPageStart);
    buttons.forEach((button, index) => {
      button.hidden = index < categoryPageStart || index >= categoryPageStart + pageSize;
    });
    categoryPrev.disabled = categoryPageStart === 0;
    categoryNext.disabled = categoryPageStart >= lastPageStart;
    requestAnimationFrame(positionCategoryIndicator);
    window.setTimeout(positionCategoryIndicator, 240);
  }

  function moveCategoryPage(direction) {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const pageSize = visibleCategoryCount();
    const lastPageStart = Math.max(0, Math.floor((buttons.length - 1) / pageSize) * pageSize);
    const nextPageStart = Math.max(0, Math.min(lastPageStart, categoryPageStart + (direction * pageSize)));
    if (nextPageStart === categoryPageStart) return;
    categoryPageStart = nextPageStart;
    const next = buttons[categoryPageStart];
    if (!next) return;
    selectCategory(next.textContent);
    window.dispatchEvent(new Event("openslot:clear-service-selection"));
  }

  function selectCategory(label) {
    const selectedGroup = [...services.querySelectorAll(".service-group")]
      .find((group) => (group.querySelector("h3")?.textContent.trim() || group.getAttribute("aria-label")) === label);
    if (!selectedGroup) return;
    activeCategory = label;
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const groups = [...services.querySelectorAll(".service-group")];
    buttons.forEach((button, index) => {
      const selected = button.textContent === label;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      groups[index].hidden = !selected;
    });
    syncCategoryNavigation();
  }

  function employeeCopy() {
    const language = window.OpenSlotI18n?.language || document.documentElement.lang || "de";
    if (language === "zh") return { label: "员工", any: "不指定员工", language: "选择语言" };
    if (language === "en") return { label: "Team member", any: "No employee preference", language: "Choose language" };
    return { label: "Mitarbeiter", any: "Ohne Mitarbeiterwahl", language: "Sprache wählen" };
  }

  function syncEmployees() {
    const checked = services.querySelector('input[name="service"]:checked');
    employeePicker.hidden = !checked || eligibleEmployeeCount <= 1;

    const copy = employeeCopy();
    employeePicker.setAttribute("aria-label", copy.label);
    employeePicker.querySelector('[role="radiogroup"]').setAttribute("aria-label", copy.label);
    const anyOption = employeeOptions.find((option) => option.dataset.employee === "any");
    if (anyOption) anyOption.querySelector("span").textContent = copy.any;
    languageMenu.querySelector("summary").setAttribute("aria-label", copy.language);
  }

  function getLocalStaffRecords() {
    const assignments = window.OpenSlotLocalRepository?.listStaffServices?.() || [];
    return (window.OpenSlotLocalRepository?.listStaff?.() || [])
      .filter((employee) => employee.acceptsOnline)
      .map((employee) => ({
        ...employee,
        serviceIds: assignments
          .filter((assignment) => assignment.staffKey === employee.staffKey)
          .map((assignment) => assignment.serviceId),
      }));
  }

  function renderEmployees(records = staffRecords) {
    staffRecords = Array.isArray(records) ? records : [];
    const group = employeePicker.querySelector('[role="radiogroup"]');
    const nextServiceId = services.querySelector('input[name="service"]:checked')?.value || "";
    const serviceChanged = nextServiceId !== selectedServiceId;
    selectedServiceId = nextServiceId;
    const available = staffRecords.filter((employee) => (
      !selectedServiceId || !Array.isArray(employee.serviceIds) || employee.serviceIds.includes(selectedServiceId)
    ));
    eligibleEmployeeCount = selectedServiceId ? available.length : 0;
    const showAnyEmployee = eligibleEmployeeCount > 1;
    group.innerHTML = `${showAnyEmployee ? '<button class="employee-option" type="button" role="radio" data-employee="any"><span></span></button>' : ""}${available.map((employee) => `<button class="employee-option" type="button" role="radio" data-employee="${escapeAttribute(employee.staffKey)}"><span>${escapeHtml(employee.name)}</span></button>`).join("")}`;
    employeeOptions = [...group.querySelectorAll(".employee-option")];
    const nextEmployee = eligibleEmployeeCount === 1
      ? available[0].staffKey
      : eligibleEmployeeCount > 1 && !serviceChanged && available.some((employee) => employee.staffKey === activeEmployee)
        ? activeEmployee
        : "any";
    const changed = nextEmployee !== activeEmployee;
    activeEmployee = nextEmployee;
    employeeOptions.forEach((option) => option.setAttribute("aria-checked", String(option.dataset.employee === activeEmployee)));
    syncEmployees();
    if (changed) window.dispatchEvent(new CustomEvent("openslot:employee-change", { detail: { staffKey: activeEmployee } }));
  }

  function selectEmployee(employee) {
    activeEmployee = employee;
    employeeOptions.forEach((option) => option.setAttribute("aria-checked", String(option.dataset.employee === employee)));
    window.dispatchEvent(new CustomEvent("openslot:employee-change", { detail: { staffKey: employee } }));
  }

  employeePicker.querySelector('[role="radiogroup"]').addEventListener("click", (event) => {
    const button = event.target.closest(".employee-option"); if (!button) return;
    const employee = button.dataset.employee; if (employee !== activeEmployee) selectEmployee(employee);
  });

  services.addEventListener("click", () => queueMicrotask(renderEmployees));
  services.addEventListener("change", renderEmployees);
  window.addEventListener("openslot:language-change", () => queueMicrotask(() => {
    applyShopProfile();
    syncEmployees();
    renderLunarDateLabels();
  }));
  window.addEventListener("openslot:staff-update", (event) => renderEmployees(event.detail?.staff || []));

  tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...tabs.querySelectorAll('[role="tab"]:not([hidden])')];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.findIndex((button) => button.getAttribute("aria-selected") === "true");
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });

  categoryPrev.addEventListener("click", () => moveCategoryPage(-1));
  categoryNext.addEventListener("click", () => moveCategoryPage(1));
  window.addEventListener("resize", syncCategoryNavigation);

  new MutationObserver(syncCategories).observe(services, { childList: true });
  new MutationObserver(syncEmployees).observe(services, { childList: true, subtree: true, attributes: true, attributeFilter: ["checked"] });
  syncCategories();
  renderEmployees(getLocalStaffRecords());
  window.OpenSlotLocalRepository?.subscribe?.("staff", () => renderEmployees(getLocalStaffRecords()));
  window.OpenSlotLocalRepository?.subscribe?.("staff-services", () => renderEmployees(getLocalStaffRecords()));
  window.OpenSlotLocalRepository?.subscribe?.("shop-profile", applyShopProfile);
  applyShopProfile();

  function formatLunarDay(day) {
    const labels = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
      "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
      "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
    return labels[day - 1] || "";
  }

  function getLunarDateLabel(dateValue) {
    // Midday UTC keeps the operational Berlin date stable for visitors in other time zones.
    const date = new Date(`${dateValue}T12:00:00Z`);
    const parts = lunarDateFormatter.formatToParts(date);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    return lunarFestivals.get(`${month}-${day}`) || formatLunarDay(day);
  }

  function renderLunarDateLabels() {
    if (!dateStrip) return;
    const showLunarDates = (window.OpenSlotI18n?.language || document.documentElement.lang) === "zh";
    dateStrip.classList.toggle("has-lunar-dates", showLunarDates);
    dateStrip.querySelectorAll(".date-button").forEach((button) => {
      const current = button.querySelector(".lunar-date-label");
      if (!showLunarDates) {
        current?.remove();
        return;
      }
      const label = getLunarDateLabel(button.dataset.date);
      const lunarLabel = current || document.createElement("span");
      lunarLabel.className = "lunar-date-label";
      if (lunarLabel.textContent !== label) lunarLabel.textContent = label;
      if (!current) button.append(lunarLabel);
      const weekday = button.querySelector(".date-weekday")?.textContent?.trim() || "";
      const day = button.querySelector("strong")?.textContent?.trim() || "";
      const ariaLabel = `${weekday} ${day}，农历${label}`.trim();
      if (button.getAttribute("aria-label") !== ariaLabel) button.setAttribute("aria-label", ariaLabel);
    });
  }

  new MutationObserver(renderLunarDateLabels).observe(dateStrip, { childList: true, subtree: true });
  renderLunarDateLabels();

  function closeLanguageMenu() {
    if (!languageMenu.open || languageMenu.classList.contains("is-closing")) return;
    languageMenu.classList.add("is-closing");
    window.setTimeout(() => {
      languageMenu.open = false;
      languageMenu.classList.remove("is-closing");
    }, 150);
  }

  languageMenu.querySelector("summary").addEventListener("click", (event) => {
    if (!languageMenu.open) return;
    event.preventDefault();
    closeLanguageMenu();
  });
  document.addEventListener("click", (event) => {
    if (languageMenu.open && !languageMenu.contains(event.target)) closeLanguageMenu();
  });
  languageMenu.querySelectorAll("[data-language-option]").forEach((button) => {
    button.addEventListener("click", closeLanguageMenu);
  });

  function syncToast() {
    clearTimeout(dismissTimer);
    toast.hidden = true;
  }

  new MutationObserver(syncToast).observe(message, { childList: true, characterData: true, subtree: true });
  new MutationObserver(syncToast).observe(result, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  close.addEventListener("click", () => { toast.hidden = true; });
  reservationDialog.addEventListener("cancel", (event) => {
    if (reservationDialog.dataset.state === "pending") event.preventDefault();
  });
  reservationDialogClose.addEventListener("click", () => reservationDialog.close());

  function reservationCopy() {
    const language = window.OpenSlotI18n?.language || document.documentElement.lang || "de";
    if (language === "zh") return {
      eyebrow: "预约", pendingTitle: "正在检查并预留时间", pendingMessage: "请稍候，我们正在确认该时间是否仍可预约。",
      successTitle: "预约成功", successMessage: "请检查您的邮箱获取确认信息。", errorTitle: "预约未完成", timeoutError: "本地预约未能完成，请重试。", close: "知道了",
    };
    if (language === "en") return {
      eyebrow: "Appointment", pendingTitle: "Checking your appointment", pendingMessage: "Please wait while we confirm this time is still available.",
      successTitle: "Appointment reserved", successMessage: "Please check your email for confirmation.", errorTitle: "Appointment not reserved", timeoutError: "The local booking did not finish. Please try again.", close: "Understood",
    };
    return {
      eyebrow: "Termin", pendingTitle: "Termin wird geprüft", pendingMessage: "Bitte warten Sie, während wir prüfen, ob diese Uhrzeit noch verfügbar ist.",
      successTitle: "Termin erfolgreich reserviert", successMessage: "Bitte prüfen Sie Ihr E-Mail-Postfach auf die Bestätigung.",
      errorTitle: "Termin konnte nicht reserviert werden", timeoutError: "Die lokale Buchung wurde nicht abgeschlossen. Bitte versuchen Sie es erneut.", close: "Verstanden",
    };
  }

  function updateReservationDialog(state, detail = "") {
    const copy = reservationCopy();
    reservationDialog.dataset.state = state;
    reservationDialogEyebrow.textContent = copy.eyebrow;
    reservationDialogTitle.textContent = state === "pending" ? copy.pendingTitle : state === "success" ? copy.successTitle : copy.errorTitle;
    reservationDialogMessage.textContent = detail || (state === "pending" ? copy.pendingMessage : state === "success" ? copy.successMessage : "");
    reservationDialogClose.textContent = copy.close;
    reservationDialogClose.hidden = state === "pending";
  }

  function beginReservation() {
    clearTimeout(reservationGuardTimer);
    reservationRequest = { startedAt: performance.now(), settled: false };
    result.hidden = true;
    result.replaceChildren();
    message.textContent = "";
    updateReservationDialog("pending");
    if (!reservationDialog.open) reservationDialog.showModal();
    reservationGuardTimer = window.setTimeout(() => settleReservation("error", reservationCopy().timeoutError), 10_000);
  }

  function settleReservation(state, detail) {
    if (!reservationRequest || reservationRequest.settled) return;
    reservationRequest.settled = true;
    clearTimeout(reservationGuardTimer);
    const delay = Math.max(0, 420 - (performance.now() - reservationRequest.startedAt));
    window.setTimeout(() => updateReservationDialog(state, detail), delay);
  }

  function syncReservationResult() {
    clearTimeout(reservationSyncTimer);
    reservationSyncTimer = window.setTimeout(() => {
      if (!reservationRequest || reservationRequest.settled) return;
      const hasResult = !result.hidden && Boolean(result.textContent.trim());
      const detail = message.textContent.trim();
      if (hasResult) settleReservation("success", detail);
      else if (detail) settleReservation("error", detail);
    }, 0);
  }

  new MutationObserver(syncReservationResult).observe(message, { childList: true, characterData: true, subtree: true });
  new MutationObserver(syncReservationResult).observe(result, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  form.addEventListener("openslot:booking-check-start", beginReservation);
  form.addEventListener("openslot:booking-check-complete", (event) => {
    const status = event.detail?.status === "success" ? "success" : "error";
    const detail = status === "error" ? message.textContent.trim() : "";
    settleReservation(status, detail);
  });
  form.addEventListener("submit", (event) => {
    const invalid = [...form.querySelectorAll('input[name="name"], input[name="phone"], input[name="email"]')]
      .find((input) => !input.checkValidity());
    if (!invalid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const label = invalid.closest("label")?.querySelector("span")?.textContent.trim() || invalid.name;
    message.textContent = invalid.validity.typeMismatch
      ? "Bitte eine gültige E-Mail-Adresse eingeben."
      : `Bitte ${label} ausfüllen.`;
    invalid.focus();
  }, true);
  syncToast();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
