import { escapeHtml } from "../core/html.mjs";

export function createWeeklyHoursHtml({ today, days, translate, formatHours }) {
  return `
    <details class="hours-details">
      <summary>
        <span>${escapeHtml(translate(today.key))}</span>
        <strong>${escapeHtml(formatHours(today))}</strong>
      </summary>
      <dl class="weekly-hours">
        ${days.map((day) => `
          <div class="${day.openMinutes === null ? "closed-day" : ""}">
            <dt>${escapeHtml(translate(day.key))}</dt>
            <dd>${escapeHtml(formatHours(day))}</dd>
          </div>
        `).join("")}
      </dl>
    </details>
  `;
}

export function createSalonHoursHtml({ rows, todayKey, isClosed }) {
  return `
    <details class="hours-details">
      <summary>
        <span>${escapeHtml(rows[todayKey].label)}</span>
        <strong>${escapeHtml(rows[todayKey].hours)}</strong>
      </summary>
      <dl class="weekly-hours">
        ${Object.values(rows).map((day) => `
          <div class="${isClosed(day.hours) ? "closed-day" : ""}">
            <dt>${escapeHtml(day.label)}</dt>
            <dd>${escapeHtml(day.hours)}</dd>
          </div>
        `).join("")}
      </dl>
    </details>
  `;
}

export function createServiceCatalogHtml({
  groups,
  services,
  selectedServiceId,
  requireSelection,
  translate,
  getServiceName,
  formatPrice,
}) {
  return `
    <div class="service-strip-shell">
      <button class="service-nav-button" type="button" data-service-scroll="-1" aria-label="${escapeHtml(translate("customer.previousServices"))}">‹</button>
      <div class="service-carousel" aria-label="${escapeHtml(translate("booking.serviceLegend"))}">
        ${groups.map((group) => `
          <section class="service-group" data-service-category="${escapeHtml(group.category)}" aria-label="${escapeHtml(group.label)}">
            <h3>${escapeHtml(group.label)}</h3>
            <div class="service-group-grid">
              ${group.services.map((service) => {
    const serviceGender = service.gender === "male" ? "male" : "female";
    const checked = service.id === selectedServiceId;
    const fallbackChecked = !requireSelection && !selectedServiceId && service.id === services[0]?.id;
    return `
                <label class="service-card">
                  <input type="radio" name="service" value="${escapeHtml(service.id)}" data-gender="${serviceGender}" ${checked || fallbackChecked ? "checked" : ""} />
                  <strong>${escapeHtml(getServiceName(service))}</strong>
                  <small>${escapeHtml(translate("customer.serviceMeta", { duration: service.duration, price: formatPrice(service) }))}</small>
                </label>
              `;
  }).join("")}
            </div>
          </section>
        `).join("")}
      </div>
      <button class="service-nav-button" type="button" data-service-scroll="1" aria-label="${escapeHtml(translate("customer.nextServices"))}">›</button>
    </div>
  `;
}

export function createDateStripHtml({ dateOptions, selectedDate, monthLabel, formatDateLabel }) {
  return `
    <div class="date-month-heading">${escapeHtml(monthLabel)}</div>
    <div class="date-row">
      ${dateOptions.map((option) => {
    const date = new Date(`${option.date}T00:00:00`);
    const label = formatDateLabel(date);
    const classes = [
      "date-button",
      option.date === selectedDate ? "selected" : "",
      option.isBusinessDay ? "" : "closed",
    ].filter(Boolean).join(" ");
    return `
        <button class="${classes}" type="button" data-date="${escapeHtml(option.date)}" ${option.isBusinessDay ? "" : "disabled"}>
          <span class="date-weekday">${escapeHtml(label.weekday)}</span>
          <strong>${escapeHtml(label.day)}</strong>
        </button>
      `;
  }).join("")}
    </div>
  `;
}

export function createSlotsHtml({ slots, selectedSlot, translate }) {
  return `
    <div class="slot-row">
      ${slots.map((slot) => {
    const classes = [
      "slot-button",
      slot.available ? "available" : "unavailable",
      slot.time === selectedSlot ? "selected" : "",
    ].filter(Boolean).join(" ");
    const title = slot.available ? translate("booking.slotFree") : slot.reason;
    return `<button type="button" class="${classes}" data-slot="${escapeHtml(slot.time)}" title="${escapeHtml(title)}" ${slot.available ? "" : "disabled"}><span>${escapeHtml(slot.time)}</span></button>`;
  }).join("")}
    </div>
  `;
}

export function createBookingSummaryHtml({ serviceName, serviceMeta, dateLabel, timeLabel }) {
  return `
    <span><strong>${escapeHtml(serviceName)}</strong><small>${escapeHtml(serviceMeta)}</small></span>
    <span>${escapeHtml(dateLabel)}</span>
    <span>${escapeHtml(timeLabel)}</span>
  `;
}

export function createBookingResultHtml({ successText, emailText = "" }) {
  return `
    <strong>${escapeHtml(successText)}</strong>
    ${emailText ? `<span>${escapeHtml(emailText)}</span>` : ""}
  `;
}
