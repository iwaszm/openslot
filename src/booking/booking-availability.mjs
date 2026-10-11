import { getServiceOccupiedMinutes } from "./scheduling.mjs";
import { formatMinutes } from "../core/time.mjs";

export function buildBookingSlots({
  date,
  service,
  daySettings,
  schedule,
  slotStep,
  isPastSlot,
  findAvailableLane,
}) {
  if (daySettings.isBlockedDay) return [];
  const slots = [];
  for (let start = daySettings.openMinutes; start + service.duration <= daySettings.closeMinutes; start += slotStep) {
    const candidate = {
      date,
      serviceId: service.id,
      startMinutes: start,
      endMinutes: start + service.duration,
      occupiedMinutes: getServiceOccupiedMinutes(service, start, slotStep),
    };
    const isPast = isPastSlot(date, start);
    const laneUnavailable = !findAvailableLane(candidate, schedule);
    const reasonKey = isPast
      ? "customer.slotPast"
      : laneUnavailable ? "customer.slotOccupied" : "";
    slots.push({
      time: formatMinutes(start),
      available: !reasonKey,
      isPast,
      reasonKey,
    });
  }
  return slots;
}

export function getNoSlotMessageKey({ hasService, daySettings, slots }) {
  if (!hasService) return "customer.noServices";
  if (daySettings.isBlockedDay) return "customer.dayUnavailable";
  if (slots.length === 0) return "customer.serviceOutsideHours";
  if (slots.every((slot) => slot.isPast)) return "customer.noLaterToday";
  if (slots.every((slot) => slot.reasonKey === "customer.slotOccupied")) return "customer.allTimesOccupied";
  if (slots.every((slot) => slot.reasonKey === "customer.slotBlocked")) return "customer.allTimesBlocked";
  return "customer.chooseAvailableTime";
}

export function validateBookingCandidate({ appointment, daySettings, schedule, findAvailableLane }) {
  if (daySettings.isBlockedDay) return "customer.dayUnavailable";
  if (appointment.startMinutes < daySettings.openMinutes || appointment.endMinutes > daySettings.closeMinutes) {
    return "customer.timeOutsideHours";
  }
  if (!findAvailableLane(appointment, schedule)) return "customer.noCompleteLane";
  return "";
}
