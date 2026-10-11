import test from "node:test";
import assert from "node:assert/strict";

import {
  canPlaceManualService,
  findAvailableManualLane,
  getAvailableManualStarts,
  getManualServicesForStaff,
} from "../../src/admin/manual-booking-model.mjs";
import { renderBookingLogAppointment, sortUpcomingAppointments } from "../../src/admin/booking-log-view.mjs";

const lanes = [
  { laneKey: "a", staffKey: "linda", staffId: "s1" },
  { laneKey: "b", staffKey: "linda", staffId: "s1" },
];
const service = { id: "cut", isActive: true, duration: 60 };

test("filters manual services by active staff assignment", () => {
  const result = getManualServicesForStaff({
    services: [service, { id: "old", isActive: false, duration: 30 }],
    staffServiceKeys: new Set(["linda:cut"]),
    staffKey: "linda",
  });
  assert.deepEqual(result.map((item) => item.id), ["cut"]);
});

test("manual appointment can use the second lane but respects staff blocks", () => {
  const base = {
    service,
    startMinutes: 600,
    daySettings: { openMinutes: 540, closeMinutes: 1080, isBlockedDay: false },
    staffLanes: lanes,
    laneLayout: lanes,
    appointments: [{ id: "one", laneKey: "a", startMinutes: 600, endMinutes: 660, status: "confirmed" }],
    manualEntries: [],
    timeBlocks: [],
  };
  assert.equal(canPlaceManualService(base), true);
  assert.equal(canPlaceManualService({ ...base, timeBlocks: [{ staffId: "s1", startMinutes: 600, endMinutes: 630 }] }), false);
});

test("available starts and lane choice use injected conflict rules", () => {
  assert.deepEqual(getAvailableManualStarts({
    services: [service],
    daySettings: { openMinutes: 600, closeMinutes: 690 },
    slotStep: 30,
    canPlace: (_service, minute) => minute !== 630,
  }), [600, 660]);
  assert.equal(findAvailableManualLane({ staffLanes: lanes, canPlaceOnLane: (lane) => lane.laneKey === "b" }).laneKey, "b");
});

test("booking log sorts appointments and escapes customer content", () => {
  const appointments = sortUpcomingAppointments([
    { id: "2", date: "2026-10-12", startMinutes: 660 },
    { id: "1", date: "2026-10-12", startMinutes: 600 },
  ]);
  assert.deepEqual(appointments.map((item) => item.id), ["1", "2"]);
  const html = renderBookingLogAppointment({
    appointment: { ...appointments[0], name: "<Ada>", phone: "123", status: "confirmed" },
    serviceLabel: "Cut",
    canCancel: true,
    unnamedCustomer: "Unknown",
  });
  assert.match(html, /&lt;Ada&gt;/);
  assert.match(html, /data-log-cancel="1"/);
});
