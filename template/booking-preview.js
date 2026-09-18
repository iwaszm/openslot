(() => {
  const tabs = document.querySelector("#serviceCategoryTabs");
  const services = document.querySelector("#serviceOptions");
  const toast = document.querySelector("#bookingToast");
  const message = document.querySelector("#formMessage");
  const result = document.querySelector("#bookingResult");
  const close = document.querySelector("#bookingToastClose");
  const form = document.querySelector("#bookingForm");
  let activeCategory = "";
  let dismissTimer;

  function syncCategories() {
    const groups = [...services.querySelectorAll(".service-group")];
    if (!groups.length) {
      tabs.replaceChildren();
      tabs.hidden = true;
      return;
    }

    const labels = groups.map((group) => group.querySelector("h3")?.textContent.trim() || group.getAttribute("aria-label"));
    if (!labels.includes(activeCategory)) activeCategory = labels[0];
    tabs.hidden = false;
    tabs.replaceChildren(...labels.map((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "service-category-tab";
      button.id = `service-category-tab-${index}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `service-category-panel-${index}`);
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
    activeCategory = label;
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    const groups = [...services.querySelectorAll(".service-group")];
    buttons.forEach((button, index) => {
      const selected = button.textContent === label;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      groups[index].hidden = !selected;
    });
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
  syncCategories();

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
