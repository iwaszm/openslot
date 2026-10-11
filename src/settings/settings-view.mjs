import { escapeAttribute, escapeHtml } from "../core/html.mjs";
import { buildOccupiedSlotNumbers, buildTimeOptions } from "./settings-model.mjs";

export function renderOnlineIcon(translate) {
  const label = escapeAttribute(translate("common.online"));
  return `<span class="online-status-icon" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>`;
}

export function renderHoursMarkup(hoursRows, translate) {
  const options = buildTimeOptions();
  return hoursRows.map((hours) => `
    <div class="hours-row ${hours.isClosed ? "closed" : ""}" data-weekday="${hours.weekday}">
      <strong>${escapeHtml(translate(`weekday.${hours.weekday}`))}</strong>
      <label class="status-switch hours-switch"><span>${escapeHtml(hours.isClosed ? translate("settings.closed") : translate("settings.open"))}</span><input type="checkbox" data-hours-open ${hours.isClosed ? "" : "checked"}><i aria-hidden="true"></i></label>
      <label>${escapeHtml(translate("common.from"))}<select data-hours-start>${renderTimeOptions(options, hours.openTime)}</select></label>
      <label>${escapeHtml(translate("common.until"))}<select data-hours-end>${renderTimeOptions(options, hours.closeTime)}</select></label>
    </div>
  `).join("");
}

export function renderStaffListMarkup(staff, selectedStaffId, translate) {
  return staff.map((employee) => `
    <button class="staff-list-item ${employee.id === selectedStaffId ? "selected" : ""} ${employee.isActive ? "" : "inactive"}" type="button" data-staff-id="${escapeAttribute(employee.id)}">
      <span class="staff-initial" style="--staff-color:${escapeAttribute(employee.color)}">${escapeHtml(employee.shortName.slice(0, 2))}</span>
      <span><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.shortName)} · ${escapeHtml(translate("settings.twoLanes"))}</small></span>
      ${employee.acceptsOnline ? renderOnlineIcon(translate) : ""}
    </button>
  `).join("");
}

export function renderCatalogMarkup({ data, draft, selectedCatalog, readOnly, translate }) {
  const categories = new Map(data.categories.map((category) => [category.id, category]));
  const services = new Map(data.services.map((service) => [service.id, service]));
  return draft.categoryIds.map((categoryId) => {
    const category = categories.get(categoryId);
    if (!category) return "";
    const children = (draft.serviceIdsByCategory[categoryId] || []).map((id) => services.get(id)).filter(Boolean);
    return `<section class="catalog-category ${category.isActive ? "" : "inactive"}" data-category-id="${escapeAttribute(category.id)}">
      <button class="catalog-entry category-entry ${selectedCatalog.type === "category" && selectedCatalog.id === category.id ? "selected" : ""}" type="button" draggable="${!readOnly}" data-drag-type="category" data-item-id="${escapeAttribute(category.id)}" data-edit-type="category">
        <span class="drag-handle" aria-hidden="true">⋮⋮</span><span class="catalog-copy"><strong>${escapeHtml(category.shortName)}</strong><small>${escapeHtml(category.name)} · ${escapeHtml(translate("settings.children", { count: children.length }))}</small></span>${category.acceptsOnline ? renderOnlineIcon(translate) : ""}
      </button>
      <div class="catalog-services" data-category-services="${escapeAttribute(category.id)}">
        ${children.map((service) => `<button class="catalog-entry service-entry ${service.isActive ? "" : "inactive"} ${selectedCatalog.type === "service" && selectedCatalog.id === service.id ? "selected" : ""}" type="button" draggable="${!readOnly}" data-drag-type="service" data-item-id="${escapeAttribute(service.id)}" data-edit-type="service">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span><span class="service-color-chip" style="--service-color:${escapeAttribute(service.color || "#dfeee8")}" aria-hidden="true"></span><span class="catalog-copy"><strong>${escapeHtml(service.shortName)}</strong><small>${escapeHtml(service.name)} · ${escapeHtml(translate("settings.minutes", { count: service.duration }))} · ${service.priceFrom ? escapeHtml(translate("settings.priceFromPrefix")) : ""}${service.price.toFixed(0)} €</small></span>${service.acceptsOnline ? renderOnlineIcon(translate) : ""}
        </button>`).join("")}
        <div class="catalog-drop-end" data-drop-category="${escapeAttribute(category.id)}"><span>${escapeHtml(translate("settings.dropAtEnd"))}</span></div>
      </div>
    </section>`;
  }).join("");
}

export function renderOccupiedSlotsMarkup(duration, selected = []) {
  return buildOccupiedSlotNumbers(duration).map((slot) => (
    `<label><input type="checkbox" name="occupiedSlot" value="${slot}" ${selected.includes(slot) ? "checked" : ""}><span>${slot}</span></label>`
  )).join("");
}

export function renderDurationOptionsMarkup(translate) {
  return Array.from({ length: 16 }, (_, index) => {
    const minutes = (index + 1) * 30;
    return `<option value="${minutes}">${escapeHtml(translate("settings.minutes", { count: minutes }))}</option>`;
  }).join("");
}

function renderTimeOptions(options, selected) {
  return options.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}
