export function groupLanesByStaff(lanes) {
  const groups = [];
  lanes.forEach((lane, index) => {
    const previous = groups.at(-1);
    if (previous?.key === lane.staffKey) previous.lanes.push(lane);
    else groups.push({
      key: lane.staffKey,
      name: lane.staffShortName || lane.staffName,
      fullName: lane.staffName,
      color: lane.staffColor || "#d7ef57",
      staffId: lane.staffId || null,
      acceptsOnline: lane.staffAcceptsOnline === true,
      start: index,
      lanes: [lane],
    });
  });
  return groups;
}

export function allocateAppointmentsByLane(appointments, layout) {
  const result = new Map(layout.map((lane) => [lane.laneKey, []]));
  appointments.forEach((appointment) => {
    const requested = String(appointment.laneKey || "").toLowerCase();
    let laneKey = result.has(requested) ? requested : null;
    if (!laneKey) {
      laneKey = layout.find((lane) => (
        !hasTimeRangeOverlap(appointment, result.get(lane.laneKey))
      ))?.laneKey;
    }
    if (laneKey) result.get(laneKey).push(appointment);
  });
  return result;
}

export function hasTimeRangeOverlap(candidate, appointments) {
  return appointments.some((appointment) => (
    candidate.startMinutes < appointment.endMinutes
    && candidate.endMinutes > appointment.startMinutes
  ));
}

export function getOccupiedRanges(item, slotStep = 30) {
  if (Array.isArray(item.occupiedMinutes) && item.occupiedMinutes.length > 0) {
    return item.occupiedMinutes.map((startMinutes) => ({
      startMinutes,
      endMinutes: startMinutes + slotStep,
    }));
  }
  return [{ startMinutes: item.startMinutes, endMinutes: item.endMinutes }];
}

export function hasOccupiedOverlap(candidate, ranges, slotStep = 30) {
  const candidateRanges = getOccupiedRanges(candidate, slotStep);
  return ranges.some((range) => (
    range.status !== "cancelled"
    && candidateRanges.some((candidateRange) => getOccupiedRanges(range, slotStep).some((occupiedRange) => (
      candidateRange.startMinutes < occupiedRange.endMinutes
      && candidateRange.endMinutes > occupiedRange.startMinutes
    )))
  ));
}

export function getServiceOccupiedMinutes(service, startMinutes, slotStep = 30) {
  const bookedSlots = Array.isArray(service.bookedSlots) && service.bookedSlots.length > 0
    ? service.bookedSlots
    : Array.from({ length: Math.ceil(service.duration / slotStep) }, (_, index) => index + 1);
  return bookedSlots.map((slotNumber) => startMinutes + ((slotNumber - 1) * slotStep));
}

export function getServiceCoveredMinutes(service, startMinutes, slotStep = 30) {
  return Array.from(
    { length: Math.ceil(service.duration / slotStep) },
    (_, index) => startMinutes + (index * slotStep),
  );
}

export function getCoverageStarts(item, slotStep = 30) {
  const starts = [];
  for (let start = item.startMinutes; start < item.endMinutes; start += slotStep) starts.push(start);
  return starts;
}

export function getCoverageEdgeClasses(item, startMinutes, slotStep = 30) {
  const starts = getCoverageStarts(item, slotStep);
  return edgeClasses(starts, startMinutes, slotStep);
}

export function getOccupiedEdgeClasses(item, startMinutes, slotStep = 30) {
  const starts = getOccupiedRanges(item, slotStep)
    .map((range) => range.startMinutes)
    .sort((left, right) => left - right);
  return edgeClasses(starts, startMinutes, slotStep);
}

export function sortServices(services, getFallbackSortIndex) {
  return services.slice().sort((left, right) => {
    const leftCategory = Number.isFinite(left.categorySortOrder) ? left.categorySortOrder : 999;
    const rightCategory = Number.isFinite(right.categorySortOrder) ? right.categorySortOrder : 999;
    const leftService = Number.isFinite(left.sortOrder) ? left.sortOrder : getFallbackSortIndex(left.id);
    const rightService = Number.isFinite(right.sortOrder) ? right.sortOrder : getFallbackSortIndex(right.id);
    return (leftCategory - rightCategory)
      || (leftService - rightService)
      || left.name.localeCompare(right.name);
  });
}

export function getDateLoadStatus(option) {
  if (!option.isBusinessDay || option.isBlockedDay) return "date-closed";
  const ratio = option.totalSlotCount > 0 ? option.occupiedSlotCount / option.totalSlotCount : 0;
  if (ratio >= 1) return "date-load-full";
  if (ratio > 0.75) return "date-load-dark-red";
  if (ratio > 0.5) return "date-load-red";
  if (ratio > 0.25) return "date-load-yellow";
  return "date-load-green";
}

export function calculateScheduleLoad({
  appointments,
  manualEntries,
  daySettings,
  timeBlocks,
  laneLayout,
  slotStep = 30,
}) {
  const lanes = laneLayout.filter((lane) => lane.staffAcceptsOnline === true);
  const laneKeys = new Set(lanes.map((lane) => lane.laneKey));
  const occupied = new Set();
  const addOccupiedRanges = (laneKey, item) => {
    if (!laneKeys.has(laneKey)) return;
    getOccupiedRanges(item, slotStep).forEach((range) => {
      if (range.startMinutes < daySettings.openMinutes || range.startMinutes >= daySettings.closeMinutes) return;
      occupied.add(`${laneKey}:${range.startMinutes}`);
    });
  };

  const allocated = allocateAppointmentsByLane(
    appointments.filter((appointment) => appointment.status !== "cancelled"),
    laneLayout,
  );
  lanes.forEach((lane) => {
    (allocated.get(lane.laneKey) || []).forEach((appointment) => addOccupiedRanges(lane.laneKey, appointment));
  });
  manualEntries.forEach((entry) => addOccupiedRanges(entry.laneKey, entry));
  timeBlocks.forEach((block) => {
    lanes.filter((lane) => !block.staffId || lane.staffId === block.staffId).forEach((lane) => {
      for (let start = block.startMinutes; start < block.endMinutes; start += slotStep) {
        addOccupiedRanges(lane.laneKey, { startMinutes: start, endMinutes: start + slotStep });
      }
    });
  });
  const slotsPerLane = Math.max(0, Math.floor(
    (daySettings.closeMinutes - daySettings.openMinutes) / slotStep,
  ));
  return {
    occupiedSlotCount: occupied.size,
    totalSlotCount: slotsPerLane * lanes.length,
  };
}

function edgeClasses(starts, startMinutes, slotStep) {
  return [
    starts.length === 1 ? "booking-single" : "",
    startMinutes === starts[0] ? "booking-first" : "",
    startMinutes === starts[starts.length - 1] ? "booking-last" : "",
    starts.includes(startMinutes - slotStep) ? "booking-contiguous-prev" : "",
    starts.includes(startMinutes + slotStep) ? "booking-contiguous-next" : "",
  ].filter(Boolean).join(" ");
}
