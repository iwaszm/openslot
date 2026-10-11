import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookingSlots,
  getNoSlotMessageKey,
  validateBookingCandidate,
} from "../../src/booking/booking-availability.mjs";

test("builds slots from covered duration and sparse occupied slots", () => {
  const slots = buildBookingSlots({
    date: "2026-10-12",
    service: { id: "color", duration: 120, bookedSlots: [1, 4] },
    daySettings: { openMinutes: 600, closeMinutes: 780, isBlockedDay: false },
    schedule: [],
    slotStep: 30,
    isPastSlot: () => false,
    findAvailableLane: (candidate) => candidate.occupiedMinutes[1] === 690 ? "a" : null,
  });
  assert.equal(slots.length, 3);
  assert.equal(slots[0].time, "10:00");
  assert.equal(slots[0].available, true);
});

test("returns a stable reason key when all slots are occupied", () => {
  const key = getNoSlotMessageKey({
    hasService: true,
    daySettings: { isBlockedDay: false },
    slots: [{ isPast: false, reasonKey: "customer.slotOccupied" }],
  });
  assert.equal(key, "customer.allTimesOccupied");
});

test("validates a refreshed candidate against working hours and lanes", () => {
  const outside = validateBookingCandidate({
    appointment: { startMinutes: 500, endMinutes: 560 },
    daySettings: { openMinutes: 600, closeMinutes: 1080, isBlockedDay: false },
    schedule: [],
    findAvailableLane: () => "a",
  });
  assert.equal(outside, "customer.timeOutsideHours");

  const conflict = validateBookingCandidate({
    appointment: { startMinutes: 600, endMinutes: 660 },
    daySettings: { openMinutes: 600, closeMinutes: 1080, isBlockedDay: false },
    schedule: [],
    findAvailableLane: () => null,
  });
  assert.equal(conflict, "customer.noCompleteLane");
});
