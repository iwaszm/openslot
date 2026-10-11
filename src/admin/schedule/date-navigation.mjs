import { escapeAttribute, escapeHtml } from "../../core/html.mjs";

export function createDateNavigationController({ elements, state, formatButtonLabel, getLocale,
  getWeeklyRule, refreshDay, refreshOptions, toDateValue }) {
  function getPageStart(selectedIndex) {
    if (selectedIndex <= 0) return 0;
    const firstMonday = state.dateOptions.findIndex((option, index) => index > 0
      && new Date(`${option.date}T00:00:00`).getDay() === 1);
    if (firstMonday < 0 || selectedIndex < firstMonday) return 0;
    return firstMonday + Math.floor((selectedIndex - firstMonday) / 7) * 7;
  }

  function render() {
    if (!elements.strip || state.dateOptions.length === 0) return;
    const selectedDate = new Date(`${elements.input.value}T00:00:00`);
    if (elements.month) elements.month.textContent = new Intl.DateTimeFormat(getLocale(), { month: "long" }).format(selectedDate);
    const selectedIndex = Math.max(0, state.dateOptions.findIndex((option) => option.date === elements.input.value));
    if (selectedIndex < state.datePageStart || selectedIndex >= state.datePageStart + 7) state.datePageStart = getPageStart(selectedIndex);
    const options = state.dateOptions.slice(state.datePageStart, state.datePageStart + 7);
    elements.strip.className = `mini-day-strip ${state.datePageStart === 0 ? "today-page" : "future-page"}`;
    elements.strip.innerHTML = options.map((option) => {
      const date = new Date(`${option.date}T00:00:00`);
      const label = formatButtonLabel(date);
      const selected = option.date === elements.input.value;
      const selectable = getWeeklyRule(date).openMinutes !== null;
      const percent = option.totalSlotCount ? Math.min(100, Math.round(option.occupiedSlotCount / option.totalSlotCount * 100)) : 0;
      return `<button class="mini-day ${selected ? "selected" : ""} ${option.isBlockedDay ? "blocked" : ""}" type="button" data-date="${option.date}" aria-pressed="${selected}" ${option.holidayName ? `title="${escapeAttribute(option.holidayName)}"` : ""} ${selectable ? "" : "disabled"}><span class="date-weekday">${escapeHtml(label.weekday)}</span><strong>${escapeHtml(label.day)}</strong>${selectable && !option.isBlockedDay ? `<span class="day-status-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>` : ""}</button>`;
    }).join("");
    elements.previous.disabled = state.datePageStart === 0;
    elements.next.disabled = state.datePageStart + 7 >= state.dateOptions.length;
    const today = toDateValue(new Date());
    elements.today?.classList.toggle("is-active", elements.input.value === today);
    elements.today?.setAttribute("aria-pressed", String(elements.input.value === today));
    elements.strip.querySelectorAll(".mini-day:not(:disabled)").forEach((button) => {
      button.addEventListener("click", async () => {
        if (button.dataset.date === elements.input.value) return;
        elements.input.value = button.dataset.date;
        render();
        await refreshDay({ showLoading: true });
      });
    });
  }

  async function changePage(direction) {
    const current = state.dateOptions[state.datePageStart]?.date || toDateValue(new Date());
    const currentDate = new Date(`${current}T00:00:00`);
    const target = new Date(currentDate);
    if (direction > 0) {
      const days = (8 - currentDate.getDay()) % 7 || 7;
      target.setDate(currentDate.getDate() + days);
    } else {
      target.setDate(currentDate.getDate() - (currentDate.getDay() === 1 ? 7 : ((currentDate.getDay() + 6) % 7)));
    }
    const nextStart = Math.max(0, state.dateOptions.findIndex((option) => option.date === toDateValue(target)));
    if (nextStart === state.datePageStart) return;
    state.datePageStart = nextStart;
    if (!state.dateOptions[nextStart]) return;
    elements.input.value = state.dateOptions[nextStart].date;
    render();
    await Promise.all([refreshOptions(), refreshDay({ showLoading: true })]);
  }

  async function selectToday() {
    state.datePageStart = 0;
    elements.input.value = toDateValue(new Date());
    render();
    await Promise.all([refreshOptions(), refreshDay({ showLoading: true })]);
  }

  async function handleInputChange() {
    const index = state.dateOptions.findIndex((option) => option.date === elements.input.value);
    if (index >= 0) state.datePageStart = getPageStart(index);
    render();
    await Promise.all([refreshOptions(), refreshDay({ showLoading: true })]);
  }

  function bind() {
    elements.input?.addEventListener("change", handleInputChange);
    elements.previous?.addEventListener("click", () => changePage(-1));
    elements.next?.addEventListener("click", () => changePage(1));
    elements.today?.addEventListener("click", selectToday);
  }

  return Object.freeze({ bind, getPageStart, render, selectToday });
}
