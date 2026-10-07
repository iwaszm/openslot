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
  const employeePicker = document.querySelector(".employee-picker");
  let employeeOptions = [...document.querySelectorAll(".employee-option")];
  let staffRecords = [];
  let selectedServiceId = "";
  let eligibleEmployeeCount = 0;
  const languageMenu = document.querySelector(".language-menu");
  let activeCategory = "";
  let activeEmployee = "any";
  let dismissTimer;
  let reservationRequest = null;
  let reservationSyncTimer;

  function syncCategories() {
    const groups = [...services.querySelectorAll(".service-group")];
    if (!groups.length) {
      tabs.replaceChildren();
      tabs.hidden = true;
      return;
    }

    const labels = groups.map((group) => group.querySelector("h3")?.textContent.trim() || group.getAttribute("aria-label"));
    const categories = groups.map((group) => group.dataset.serviceCategory || "");
    if (!labels.includes(activeCategory)) activeCategory = labels[0] || "";
    tabs.hidden = false;
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

  function selectCategory(label) {
    const groups = [...services.querySelectorAll(".service-group")];
    activeCategory = label;
    tabs.querySelectorAll('[role="tab"]').forEach((button, index) => {
      const selected = button.textContent === label;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      groups[index].hidden = !selected;
    });
  }

  function employeeCopy() {
    const language = window.OpenSlotI18n?.language || document.documentElement.lang || "de";
    if (language === "zh") return { label: "员工", any: "不指定员工", language: "选择语言" };
    if (language === "en") return { label: "Team member", any: "No employee preference", language: "Choose language" };
    return { label: "Mitarbeiter", any: "Ohne Mitarbeiterwahl", language: "Sprache wählen" };
  }

  function syncEmployees() {
    if (!employeePicker) return;
    const checked = services.querySelector('input[name="service"]:checked');
    employeePicker.hidden = !checked || eligibleEmployeeCount <= 1;
    const copy = employeeCopy();
    employeePicker.setAttribute("aria-label", copy.label);
    employeePicker.querySelector('[role="radiogroup"]')?.setAttribute("aria-label", copy.label);
    employeeOptions.find((option) => option.dataset.employee === "any")?.querySelector("span")?.replaceChildren(copy.any);
    languageMenu.querySelector("summary")?.setAttribute("aria-label", copy.language);
  }

  function renderEmployees(records = staffRecords) {
    if (!employeePicker) return;
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

  employeePicker?.querySelector('[role="radiogroup"]')?.addEventListener("click", (event) => {
    const button = event.target.closest(".employee-option");
    if (button && button.dataset.employee !== activeEmployee) selectEmployee(button.dataset.employee || "any");
  });
  services.addEventListener("click", () => queueMicrotask(renderEmployees));
  services.addEventListener("change", renderEmployees);
  window.addEventListener("openslot:language-change", () => queueMicrotask(syncEmployees));
  window.addEventListener("openslot:staff-update", (event) => renderEmployees(event.detail?.staff || []));

  function syncToast() {
    const hasResult = !result.hidden && Boolean(result.textContent.trim());
    const hasMessage = Boolean(message.textContent.trim());
    clearTimeout(dismissTimer);
    if (reservationRequest) {
      toast.hidden = true;
      return;
    }
    toast.hidden = !(hasResult || hasMessage);
    toast.classList.toggle("booking-toast-success", hasResult);
    if (hasMessage && !hasResult) dismissTimer = setTimeout(() => { toast.hidden = true; }, 7000);
  }

  tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.findIndex((button) => button.getAttribute("aria-selected") === "true");
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });

  new MutationObserver(syncCategories).observe(services, { childList: true });
  new MutationObserver(syncEmployees).observe(services, { childList: true, subtree: true, attributes: true, attributeFilter: ["checked"] });
  new MutationObserver(syncToast).observe(message, { childList: true, characterData: true, subtree: true });
  new MutationObserver(syncToast).observe(result, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  close.addEventListener("click", () => { toast.hidden = true; });
  reservationDialog?.addEventListener("cancel", (event) => {
    if (reservationDialog.dataset.state === "pending") event.preventDefault();
  });
  reservationDialogClose?.addEventListener("click", () => {
    reservationDialog.close();
    reservationRequest = null;
    result.hidden = true;
    result.replaceChildren();
    message.textContent = "";
    syncToast();
  });
  form.addEventListener("openslot:booking-check-start", beginReservation);
  document.addEventListener("click", (event) => {
    if (languageMenu.open && !languageMenu.contains(event.target)) languageMenu.open = false;
  });
  languageMenu.querySelectorAll("[data-language-option]").forEach((button) => {
    button.addEventListener("click", () => { languageMenu.open = false; });
  });

  syncCategories();
  renderEmployees();
  syncToast();

  function reservationCopy() {
    const language = window.OpenSlotI18n?.language || document.documentElement.lang || "de";
    if (language === "zh") return {
      eyebrow: "预约",
      pendingTitle: "正在检查并预留时间",
      pendingMessage: "请稍候，我们正在确认该时间是否仍可预约。",
      successTitle: "预约成功",
      successMessage: "请检查您的邮箱获取确认信息。",
      errorTitle: "预约未完成",
      close: "知道了",
    };
    if (language === "en") return {
      eyebrow: "Appointment",
      pendingTitle: "Checking your appointment",
      pendingMessage: "Please wait while we confirm this time is still available.",
      successTitle: "Appointment reserved",
      successMessage: "Please check your email for confirmation.",
      errorTitle: "Appointment not reserved",
      close: "Understood",
    };
    return {
      eyebrow: "Termin",
      pendingTitle: "Termin wird geprüft",
      pendingMessage: "Bitte warten Sie, während wir prüfen, ob diese Uhrzeit noch verfügbar ist.",
      successTitle: "Termin erfolgreich reserviert",
      successMessage: "Bitte prüfen Sie Ihr E-Mail-Postfach auf die Bestätigung.",
      errorTitle: "Termin konnte nicht reserviert werden",
      close: "Verstanden",
    };
  }

  function updateReservationDialog(state, detail = "") {
    if (!reservationDialog) return;
    const copy = reservationCopy();
    reservationDialog.dataset.state = state;
    reservationDialogEyebrow.textContent = copy.eyebrow;
    reservationDialogTitle.textContent = state === "pending"
      ? copy.pendingTitle
      : state === "success" ? copy.successTitle : copy.errorTitle;
    reservationDialogMessage.textContent = detail || (state === "pending"
      ? copy.pendingMessage
      : state === "success" ? copy.successMessage : "");
    reservationDialogClose.textContent = copy.close;
    reservationDialogClose.hidden = state === "pending";
  }

  function beginReservation() {
    if (!reservationDialog) return;
    reservationRequest = { startedAt: performance.now(), settled: false };
    result.hidden = true;
    result.replaceChildren();
    message.textContent = "";
    updateReservationDialog("pending");
    toast.hidden = true;
    if (!reservationDialog.open) reservationDialog.showModal();
  }

  function settleReservation(state, detail) {
    if (!reservationRequest || reservationRequest.settled) return;
    reservationRequest.settled = true;
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
