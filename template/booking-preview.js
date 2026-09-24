(() => {
  const tabs = document.querySelector("#serviceCategoryTabs");
  const services = document.querySelector("#serviceOptions");
  const toast = document.querySelector("#bookingToast");
  const message = document.querySelector("#formMessage");
  const result = document.querySelector("#bookingResult");
  const close = document.querySelector("#bookingToastClose");
  const form = document.querySelector("#bookingForm");
  const employeePicker = document.querySelector(".employee-picker");
  const employeeOptions = [...document.querySelectorAll(".employee-option")];
  const languageMenu = document.querySelector(".language-menu");
  let activeCategory = "";
  let activeEmployee = "any";
  let dismissTimer;

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
    const selectedGroup = [...services.querySelectorAll(".service-group")]
      .find((group) => (group.querySelector("h3")?.textContent.trim() || group.getAttribute("aria-label")) === label);
    if (!selectedGroup) return;
    activeCategory = label;
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const groups = [...services.querySelectorAll(".service-group")];
    buttons.forEach((button, index) => {
      const selected = button.textContent === label && !button.hidden;
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
    const checked = services.querySelector('input[name="service"]:checked');
    const category = checked?.closest(".service-group")?.dataset.serviceCategory || "";
    employeePicker.hidden = !checked;
    const tonyAllowed = category === "cut" || category === "care";
    const tony = employeeOptions.find((option) => option.dataset.employee === "tony");
    tony.hidden = !tonyAllowed;
    tony.disabled = !tonyAllowed;
    if (!tonyAllowed && activeEmployee === "tony") selectEmployee("any");

    const copy = employeeCopy();
    employeePicker.setAttribute("aria-label", copy.label);
    employeePicker.querySelector('[role="radiogroup"]').setAttribute("aria-label", copy.label);
    employeeOptions.find((option) => option.dataset.employee === "any").querySelector("span").textContent = copy.any;
    languageMenu.querySelector("summary").setAttribute("aria-label", copy.language);
  }

  function selectEmployee(employee) {
    activeEmployee = employee;
    employeeOptions.forEach((option) => option.setAttribute("aria-checked", String(option.dataset.employee === employee)));
  }

  employeeOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const employee = button.dataset.employee;
      if (employee === activeEmployee) return;
      selectEmployee(employee);
    });
  });

  services.addEventListener("click", () => queueMicrotask(syncEmployees));
  services.addEventListener("change", syncEmployees);
  window.addEventListener("openslot:language-change", () => queueMicrotask(syncEmployees));

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

  new MutationObserver(syncCategories).observe(services, { childList: true });
  new MutationObserver(syncEmployees).observe(services, { childList: true, subtree: true, attributes: true, attributeFilter: ["checked"] });
  syncCategories();
  syncEmployees();

  document.addEventListener("click", (event) => {
    if (languageMenu.open && !languageMenu.contains(event.target)) languageMenu.open = false;
  });
  languageMenu.querySelectorAll("[data-language-option]").forEach((button) => {
    button.addEventListener("click", () => { languageMenu.open = false; });
  });

  function syncToast() {
    const hasResult = !result.hidden && Boolean(result.textContent.trim());
    const hasMessage = Boolean(message.textContent.trim());
    clearTimeout(dismissTimer);
    toast.hidden = !(hasResult || hasMessage);
    toast.classList.toggle("booking-toast-success", hasResult);
    if (hasMessage && !hasResult) dismissTimer = setTimeout(() => { toast.hidden = true; }, 7000);
  }

  new MutationObserver(syncToast).observe(message, { childList: true, characterData: true, subtree: true });
  new MutationObserver(syncToast).observe(result, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  close.addEventListener("click", () => { toast.hidden = true; });
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
})();
