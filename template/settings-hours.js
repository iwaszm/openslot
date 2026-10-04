(() => {
  const repository = window.OpenSlotLocalRepository;
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const previousTab = document.getElementById("settingsTabPrevious");
  const nextTab = document.getElementById("settingsTabNext");
  const sections = { account: document.getElementById("accountSettings"), profile: document.getElementById("profileSettings"), services: document.getElementById("servicesSettings"), hours: document.getElementById("hoursSettings"), staff: document.getElementById("staffSettings") };
  const form = document.getElementById("hoursSettingsForm");
  const list = document.getElementById("hoursList");
  const message = document.getElementById("hoursMessage");
  const showToast = (text) => window.OpenSlotSettingsToast?.(text);
  const t = (key, values) => window.OpenSlotBackofficeI18n?.t(key, values) || key;
  const dayName = (day) => t(`weekday.${day === 0 ? 7 : day}`);
  const pad = (value) => String(value).padStart(2, "0");
  const formatTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const options = (selected) => Array.from({ length: 33 }, (_, index) => 7 * 60 + index * 30)
    .map((minutes) => `<option value="${minutes}" ${minutes === selected ? "selected" : ""}>${formatTime(minutes)}</option>`).join("");

  function render() {
    list.innerHTML = repository.listOpeningHours().map((row) => `<div class="hours-row ${row.isOpen ? "" : "closed"}" data-day="${row.day}">
      <strong>${dayName(row.day)}</strong>
      <label class="status-switch hours-switch"><span>${row.isOpen ? t("settings.open") : t("settings.closed")}</span><input type="checkbox" name="isOpen" ${row.isOpen ? "checked" : ""}><i aria-hidden="true"></i></label>
      <label>${t("common.from")}<select name="openMinutes" ${row.isOpen ? "" : "disabled"}>${options(row.openMinutes ?? 600)}</select></label>
      <label>${t("common.until")}<select name="closeMinutes" ${row.isOpen ? "" : "disabled"}>${options(row.closeMinutes ?? 1080)}</select></label>
    </div>`).join("");
  }

  function selectTab(name) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.settingsTab === name;
      tab.classList.toggle("active", selected);
      if (selected) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
    });
    Object.entries(sections).forEach(([key, section]) => { section.hidden = key !== name; });
    const selectedIndex = tabs.findIndex((tab) => tab.dataset.settingsTab === name);
    previousTab.disabled = selectedIndex <= 0;
    nextTab.disabled = selectedIndex < 0 || selectedIndex >= tabs.length - 1;
    if (name === "hours") render();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.settingsTab)));
  previousTab.addEventListener("click", () => {
    const index = tabs.findIndex((tab) => tab.classList.contains("active"));
    if (index > 0) selectTab(tabs[index - 1].dataset.settingsTab);
  });
  nextTab.addEventListener("click", () => {
    const index = tabs.findIndex((tab) => tab.classList.contains("active"));
    if (index >= 0 && index < tabs.length - 1) selectTab(tabs[index + 1].dataset.settingsTab);
  });
  list.addEventListener("change", (event) => {
    const row = event.target.closest(".hours-row");
    if (!row || event.target.name !== "isOpen") return;
    const open = event.target.checked;
    row.classList.toggle("closed", !open);
    row.querySelector(".hours-switch span").textContent = open ? t("settings.open") : t("settings.closed");
    row.querySelectorAll("select").forEach((select) => { select.disabled = !open; });
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const rows = [...list.querySelectorAll(".hours-row")].map((row) => {
      const isOpen = row.querySelector('[name="isOpen"]').checked;
      return { day: Number(row.dataset.day), isOpen, openMinutes: isOpen ? Number(row.querySelector('[name="openMinutes"]').value) : null, closeMinutes: isOpen ? Number(row.querySelector('[name="closeMinutes"]').value) : null };
    });
    const invalid = rows.find((row) => row.isOpen && row.closeMinutes <= row.openMinutes);
    if (invalid) { showToast(t("settings.endAfterStart", { day: dayName(invalid.day) })); return; }
    repository.saveOpeningHours(rows); showToast(t("settings.hoursSavedLocal"));
  });
  document.getElementById("resetHours").addEventListener("click", () => { repository.resetOpeningHours(); render(); showToast(t("settings.standardHoursRestored")); });
  repository.subscribe("opening-hours", render);
  window.addEventListener("openslot:backoffice-language-change", render);
  selectTab(tabs.find((tab) => tab.classList.contains("active"))?.dataset.settingsTab || "account");
  render();
})();
