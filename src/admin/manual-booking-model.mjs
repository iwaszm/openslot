import { allocateAppointmentsByLane, hasTimeRangeOverlap } from "./schedule-model.mjs";

export function getManualServicesForStaff({ services, staffServiceKeys, staffKey }) {
  return services.filter((service) => (
    service.isActive
    && (!staffServiceKeys || staffServiceKeys.has(`${staffKey}:${service.id}`))
  ));
}

export function canPlaceManualService(input) {
  const { service, startMinutes, daySettings, timeBlocks, staffLanes } = input;
  if (!service || !daySettings || !Number.isFinite(startMinutes) || staffLanes.length === 0) return false;
  if (daySettings.isBlockedDay || startMinutes < daySettings.openMinutes || startMinutes >= daySettings.closeMinutes) return false;
  const endMinutes = startMinutes + service.duration;
  const staffId = staffLanes[0]?.staffId || null;
  if (timeBlocks.some((block) => (
    (!block.staffId || block.staffId === staffId)
    && startMinutes < block.endMinutes
    && endMinutes > block.startMinutes
  ))) return false;
  return staffLanes.some((lane) => canPlaceManualServiceOnLane({ ...input, lane }));
}

export function canPlaceManualServiceOnLane(input) {
  const {
    service,
    startMinutes,
    lane,
    appointments,
    manualEntries,
    laneLayout,
    excludedEntryId = "",
  } = input;
  if (!service || !lane || !Number.isFinite(startMinutes)) return false;
  const candidate = { startMinutes, endMinutes: startMinutes + service.duration };
  const allocated = allocateAppointmentsByLane(
    appointments.filter((item) => item.status !== "cancelled"),
    laneLayout,
  );
  const online = allocated.get(lane.laneKey) || [];
  const manual = manualEntries.filter((item) => (
    item.laneKey === lane.laneKey
    && String(item.id || item.scheduleEntryId) !== String(excludedEntryId)
  ));
  return !hasTimeRangeOverlap(candidate, online) && !hasTimeRangeOverlap(candidate, manual);
}

export function getAvailableManualStarts({ services, daySettings, slotStep = 30, canPlace }) {
  const starts = [];
  if (!daySettings) return starts;
  for (let minute = daySettings.openMinutes; minute < daySettings.closeMinutes; minute += slotStep) {
    if (services.some((service) => canPlace(service, minute))) starts.push(minute);
  }
  return starts;
}

export function findAvailableManualLane({ staffLanes, canPlaceOnLane }) {
  return staffLanes.find((lane) => canPlaceOnLane(lane)) || null;
}
