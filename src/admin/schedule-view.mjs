import { escapeAttribute, escapeHtml } from "../core/html.mjs";
import { formatMinutes } from "../core/time.mjs";
import { groupLanesByStaff, hasTimeRangeOverlap } from "./schedule-model.mjs";

export function renderAdminSchedule(options) {
  const {
    slots,
    lanes,
    daySettings,
    timeBlocks,
    selectedDate,
    translate,
    canEditLane,
    canManageTimeBlock,
    serviceForItem,
    getServiceAbbrev,
    toDateInputValue,
    slotStep = 30,
    now = new Date(),
  } = options;
  const staffGroups = groupLanesByStaff(lanes);
  const allEvents = lanes.flatMap((lane) => [...lane.appointments, ...lane.manual]);
  const positions = [0];
  slots.forEach((slot) => {
    const busy = allEvents.some((item) => item.startMinutes < slot.startMinutes + slotStep && item.endMinutes > slot.startMinutes);
    positions.push(positions.at(-1) + (busy ? 62 : 34));
  });
  const openMinutes = daySettings.openMinutes;
  const closeMinutes = daySettings.closeMinutes;
  const at = (minute) => {
    if (positions.length === 1) return 0;
    const clamped = Math.max(openMinutes, Math.min(closeMinutes, minute));
    const index = Math.min(positions.length - 2, Math.floor((clamped - openMinutes) / slotStep));
    const fraction = (clamped - openMinutes - index * slotStep) / slotStep;
    return positions[index] + (positions[index + 1] - positions[index]) * fraction;
  };
  const totalHeight = positions.at(-1) || 0;
  const hours = [];
  for (let minute = openMinutes; minute <= closeMinutes; minute += 60) {
    hours.push(`<div class="hour-label" style="top:${at(minute)}px">${escapeHtml(String(Math.floor(minute / 60)).padStart(2, "0"))}</div>`);
  }
  const rows = slots.map((slot, index) => `<div class="time-row ${slot.startMinutes % 60 === 0 ? "hour-row" : "half-row"}" style="top:${positions[index]}px;height:${positions[index + 1] - positions[index]}px"></div>`).join("");
  const staffMarkup = staffGroups.map((group) => {
    const staffEvents = group.lanes.flatMap((lane, laneIndex) => [
      ...lane.appointments.map((item) => ({ ...item, laneIndex, kind: "online", lane })),
      ...lane.manual.map((item) => ({ ...item, laneIndex, kind: item.serviceId ? "manual" : "blocked", lane })),
    ]).sort((left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes);
    const scopedBlocks = timeBlocks.filter((block) => !block.staffId || block.staffId === group.staffId);
    const shades = daySettings.isBlockedDay
      ? `<div class="availability-shade" style="top:0;height:${totalHeight}px"></div>`
      : scopedBlocks.map((block) => `<div class="availability-shade" style="top:${at(block.startMinutes)}px;height:${Math.max(1, at(block.endMinutes) - at(block.startMinutes))}px"></div>`).join("");
    const blockMarkup = daySettings.isBlockedDay
      ? `<article class="calendar-block day-block" style="top:0;height:${totalHeight}px"><div class="block-heading"><strong>${escapeHtml(translate("admin.dayBlocked"))}</strong></div></article>`
      : scopedBlocks.map((block) => renderTimeBlock({ block, at, group, translate, canManageTimeBlock })).join("");
    const eventMarkup = staffEvents.map((event) => renderEvent({ event, staffEvents, at, translate, serviceForItem, getServiceAbbrev })).join("");
    const editable = group.lanes.some(canEditLane);
    const slotActions = editable && !daySettings.isBlockedDay
      ? slots.map((slot, index) => {
        const slotEnd = slot.startMinutes + slotStep;
        const allLanesOccupied = group.lanes.every((_, laneIndex) => staffEvents.some((event) => (
          event.kind !== "blocked" && event.laneIndex === laneIndex
          && event.startMinutes < slotEnd && event.endMinutes > slot.startMinutes
        )));
        return allLanesOccupied ? "" : `<button class="schedule-slot-action" type="button" style="top:${positions[index]}px;height:${positions[index + 1] - positions[index]}px" data-create-staff="${escapeAttribute(group.key)}" data-create-start="${slot.startMinutes}" aria-label="${escapeAttribute(`${translate("admin.addAppointment")} · ${group.name} · ${formatMinutes(slot.startMinutes)}`)}"></button>`;
      }).join("")
      : "";
    const onlineStatus = group.acceptsOnline ? `<span class="staff-online-indicator" aria-label="${escapeAttribute(translate("common.online"))}" title="${escapeAttribute(translate("common.online"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>` : "";
    return `<section class="staff-column ${editable ? "is-editable" : "is-readonly"}" aria-label="${escapeAttribute(group.name)}${editable ? "" : `, ${escapeAttribute(translate("common.readOnly"))}`}"><div class="staff-name"><span class="staff-avatar" style="--staff-color:${escapeAttribute(group.color)}">${escapeHtml(String(group.name || "M").slice(0, 2))}</span><strong>${escapeHtml(group.name)}</strong>${onlineStatus}${editable ? "" : `<span class="readonly-label">${escapeHtml(translate("common.readOnly"))}</span>`}</div><div class="staff-timeline" style="height:${totalHeight}px">${shades}${rows}${slotActions}${blockMarkup}${eventMarkup}${renderNowLine({ at, now, selectedDate, daySettings, toDateInputValue })}</div></section>`;
  }).join("");
  return `<div class="time-gutter"><div class="gutter-heading"></div><div class="time-labels" style="height:${totalHeight}px">${hours.join("")}</div></div><div class="staff-columns ${staffGroups.length === 1 ? "single-staff" : ""}" style="--staff-count:${Math.max(1, staffGroups.length)}">${staffMarkup}</div>`;
}

function renderNowLine({ at, now, selectedDate, daySettings, toDateInputValue }) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (selectedDate !== toDateInputValue(now)
    || minutes < daySettings.openMinutes || minutes > daySettings.closeMinutes) return "";
  return `<div class="now-line" style="top:${at(minutes)}px" aria-hidden="true"></div>`;
}

function renderTimeBlock({ block, at, group, translate, canManageTimeBlock }) {
  const top = at(block.startMinutes);
  const height = Math.max(34, at(block.endMinutes) - top);
  const menu = canManageTimeBlock(block, group) ? `<details class="service-block-menu lane-menu time-block-menu"><summary aria-label="Sperre verwalten"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></summary><div class="service-block-options" role="menu"><button type="button" role="menuitem" class="clear-lane-option" data-time-block-delete="${escapeAttribute(block.id)}">Löschen</button></div></details>` : "";
  return `<article class="calendar-block time-block" style="top:${top}px;height:${height}px"><div class="block-heading"><strong>${escapeHtml(translate("admin.blocked"))}</strong>${menu}</div><span>${escapeHtml(formatMinutes(block.startMinutes))}-${escapeHtml(formatMinutes(block.endMinutes))}</span></article>`;
}

function renderEvent({ event, staffEvents, at, translate, serviceForItem, getServiceAbbrev }) {
  if (event.kind === "blocked") return "";
  const top = at(event.startMinutes);
  const height = Math.max(34, at(event.endMinutes) - top - 4);
  const overlapsOtherLane = staffEvents.some((other) => other !== event && other.laneIndex !== event.laneIndex && hasTimeRangeOverlap(event, [other]));
  const service = serviceForItem(event);
  const label = service ? getServiceAbbrev(service) : translate("admin.blockedSlot");
  const detail = event.kind === "online" ? (event.name || translate("admin.unnamedCustomer")) : (event.note || "");
  return `<article class="calendar-event ${overlapsOtherLane ? `split lane-${event.laneIndex}` : "full"}" style="--service-color:${escapeAttribute(service?.slotColor || service?.color || "#e7ece8")};top:${top}px;height:${height}px" title="${escapeAttribute(`${label} · ${formatMinutes(event.startMinutes)}-${formatMinutes(event.endMinutes)}`)}"><button class="event-main" type="button" data-event-detail="${escapeAttribute(event.id || event.scheduleEntryId || "")}" data-event-kind="${escapeAttribute(event.kind)}" aria-label="Termindetails: ${escapeAttribute(label)}"><span class="event-time">${escapeHtml(formatMinutes(event.startMinutes))}-${escapeHtml(formatMinutes(event.endMinutes))}</span><strong>${escapeHtml(label)}</strong>${detail ? `<span class="event-detail">${escapeHtml(detail)}</span>` : ""}${event.kind === "online" ? `<span class="online-indicator" aria-label="Online" title="Online"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>` : ""}</button></article>`;
}
