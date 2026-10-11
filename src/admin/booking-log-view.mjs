import { escapeAttribute, escapeHtml } from "../core/html.mjs";
import { formatMinutes } from "../core/time.mjs";

export function sortUpcomingAppointments(appointments) {
  return appointments.slice().sort((left, right) => (
    left.date.localeCompare(right.date) || left.startMinutes - right.startMinutes
  ));
}

export function renderBookingLog({ appointments, emptyLabel, renderAppointment }) {
  if (appointments.length === 0) return `<div class="empty-state">${escapeHtml(emptyLabel)}</div>`;
  return `<div class="appointment-log-items">${appointments.map(renderAppointment).join("")}</div>`;
}

export function renderBookingLogAppointment({ appointment, serviceLabel, canCancel, unnamedCustomer, cancelLabel = "Stornieren", cancelAriaLabel = cancelLabel }) {
  const isCancelled = appointment.status === "cancelled";
  const cancelButton = isCancelled || !canCancel ? "" : `<button class="cancel-log" type="button" data-log-cancel="${escapeAttribute(appointment.id)}" aria-label="${escapeAttribute(cancelAriaLabel)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg><span>${escapeHtml(cancelLabel)}</span></button>`;
  return `
    <article class="log-entry ${isCancelled ? "cancelled" : ""}">
      <div class="log-actions">${cancelButton}</div>
      <div class="log-copy">
        <div class="log-primary"><strong>${escapeHtml(appointment.name || unnamedCustomer)}</strong>${appointment.phone ? `<span class="log-phone">${escapeHtml(appointment.phone)}</span>` : ""}</div>
        <span>${escapeHtml(serviceLabel)} · ${escapeHtml(appointment.date)} · ${escapeHtml(formatMinutes(appointment.startMinutes))}</span>
      </div>
    </article>
  `;
}

export function renderCollapseIcon(collapsed) {
  const path = collapsed ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6";
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}
