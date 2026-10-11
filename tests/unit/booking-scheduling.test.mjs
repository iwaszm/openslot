import test from "node:test";
import assert from "node:assert/strict";

import {
  findAvailableLane,
  getServiceOccupiedMinutes,
  normalizeLaneLayout,
} from "../../src/booking/scheduling.mjs";

const laneLayout = [
  { laneKey: "a", staffKey: "linda" },
  { laneKey: "b", staffKey: "linda" },
  { laneKey: "c", staffKey: "tony" },
  { laneKey: "d", staffKey: "tony" },
];

test("maps sparse booked slots to occupied times", () => {
  assert.deepEqual(
    getServiceOccupiedMinutes({ duration: 120, bookedSlots: [1, 4] }, 600),
    [600, 690],
  );
});

test("rejects a staff member when occupied work conflicts across either lane", () => {
  const lane = findAvailableLane({
    candidate: {
      serviceId: "color",
      startMinutes: 600,
      endMinutes: 720,
      occupiedMinutes: [600, 690],
    },
    schedule: [{
      laneKey: "b",
      staffKey: "linda",
      startMinutes: 570,
      endMinutes: 630,
      occupiedMinutes: [600],
      status: "confirmed",
    }],
    laneLayout,
    selectedStaffKey: "linda",
  });

  assert.equal(lane, null);
});

test("allows sparse covered time when one lane remains free", () => {
  const lane = findAvailableLane({
    candidate: {
      serviceId: "color",
      startMinutes: 600,
      endMinutes: 720,
      occupiedMinutes: [600, 690],
    },
    schedule: [{
      laneKey: "a",
      staffKey: "linda",
      startMinutes: 600,
      endMinutes: 720,
      occupiedMinutes: [630, 660],
      status: "confirmed",
    }],
    laneLayout,
    selectedStaffKey: "linda",
  });

  assert.equal(lane, "b");
});

test("rejects covered time when both employee lanes are occupied", () => {
  const candidate = {
    serviceId: "cut",
    startMinutes: 600,
    endMinutes: 630,
    occupiedMinutes: [600],
  };
  const schedule = [
    { laneKey: "a", staffKey: "linda", startMinutes: 570, endMinutes: 660, occupiedMinutes: [570], status: "confirmed" },
    { laneKey: "b", staffKey: "linda", startMinutes: 570, endMinutes: 660, occupiedMinutes: [630], status: "confirmed" },
  ];

  assert.equal(findAvailableLane({ candidate, schedule, laneLayout, selectedStaffKey: "linda" }), null);
});

test("respects service assignments and can fall through to another employee", () => {
  const lane = findAvailableLane({
    candidate: { serviceId: "cut", startMinutes: 600, endMinutes: 630, occupiedMinutes: [600] },
    schedule: [],
    laneLayout,
    staffServiceKeys: new Set(["tony:cut"]),
  });

  assert.equal(lane, "c");
});

test("normalizes and sorts Supabase lane records", () => {
  const normalized = normalizeLaneLayout([
    { laneKey: "D", laneSortOrder: 2, staffKey: "tony", staffSortOrder: 2 },
    { laneKey: "A", laneSortOrder: 1, staffKey: "linda", staffName: "Linda", staffSortOrder: 1 },
  ]);

  assert.deepEqual(normalized.map((lane) => lane.laneKey), ["a", "d"]);
  assert.equal(normalized[0].staffShortName, "Linda");
});
