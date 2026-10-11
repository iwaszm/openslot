export const DEFAULT_SLOT_STEP = 30;

export function getOccupiedRanges(item, slotStep = DEFAULT_SLOT_STEP) {
  if (Array.isArray(item.occupiedMinutes) && item.occupiedMinutes.length > 0) {
    return item.occupiedMinutes.map((startMinutes) => ({
      startMinutes,
      endMinutes: startMinutes + slotStep,
    }));
  }
  return [{ startMinutes: item.startMinutes, endMinutes: item.endMinutes }];
}

export function getServiceOccupiedMinutes(service, startMinutes, slotStep = DEFAULT_SLOT_STEP) {
  const bookedSlots = Array.isArray(service.bookedSlots) && service.bookedSlots.length > 0
    ? service.bookedSlots
    : Array.from({ length: Math.ceil(service.duration / slotStep) }, (_, index) => index + 1);

  return bookedSlots.map((slotNumber) => startMinutes + ((slotNumber - 1) * slotStep));
}

export function hasOccupiedOverlap(candidate, records, slotStep = DEFAULT_SLOT_STEP) {
  const candidateRanges = getOccupiedRanges(candidate, slotStep);
  return records.some((record) => (
    record.status !== "cancelled"
    && candidateRanges.some((candidateRange) => getOccupiedRanges(record, slotStep).some((occupiedRange) => (
      candidateRange.startMinutes < occupiedRange.endMinutes
      && candidateRange.endMinutes > occupiedRange.startMinutes
    )))
  ));
}

export function findAvailableLane({
  candidate,
  schedule,
  laneLayout,
  selectedStaffKey = "any",
  staffServiceKeys = null,
  slotStep = DEFAULT_SLOT_STEP,
}) {
  const globalBlocks = schedule.filter((item) => !item.staffKey && !item.laneKey);
  if (globalBlocks.some((block) => (
    candidate.startMinutes < block.endMinutes && candidate.endMinutes > block.startMinutes
  ))) return null;

  const allStaffKeys = [...new Set(laneLayout.map((lane) => lane.staffKey))];
  const staffKeys = selectedStaffKey === "any"
    ? allStaffKeys
    : allStaffKeys.filter((staffKey) => staffKey === selectedStaffKey);

  for (const staffKey of staffKeys) {
    if (candidate.serviceId && staffServiceKeys
      && !staffServiceKeys.has(`${staffKey}:${candidate.serviceId}`)) continue;

    const staffLanes = laneLayout.filter((lane) => lane.staffKey === staffKey);
    const laneKeys = new Set(staffLanes.map((lane) => lane.laneKey));
    const staffSchedule = schedule.filter((item) => (
      item.status !== "cancelled" && laneKeys.has(item.laneKey)
    ));

    // Occupied work cannot overlap anywhere in the employee's two-lane schedule.
    if (hasOccupiedOverlap(candidate, staffSchedule, slotStep)) continue;

    // Covered time may overlap once, but both lanes cannot be covered simultaneously.
    const availableLane = staffLanes.find((lane) => !staffSchedule.some((item) => (
      item.laneKey === lane.laneKey
      && candidate.startMinutes < item.endMinutes
      && candidate.endMinutes > item.startMinutes
    )));
    if (availableLane) return availableLane.laneKey;
  }

  return null;
}

export function normalizeLaneLayout(rows, fallbackRows = []) {
  if (!Array.isArray(rows)) return fallbackRows.map((row) => ({ ...row }));
  if (rows.length === 0) return [];

  return rows
    .filter((row) => row.laneKey)
    .map((row) => ({
      laneKey: String(row.laneKey).toLowerCase(),
      laneSortOrder: Number(row.laneSortOrder || 0),
      staffKey: row.staffKey || "default",
      staffName: row.staffName || row.staffShortName || row.staffKey || "Mitarbeiter",
      staffShortName: row.staffShortName || row.staffName || row.staffKey || "M",
      staffColor: row.staffColor || "#d7ef57",
      staffSortOrder: Number(row.staffSortOrder || 0),
    }))
    .sort((left, right) => (
      left.staffSortOrder - right.staffSortOrder || left.laneSortOrder - right.laneSortOrder
    ));
}
