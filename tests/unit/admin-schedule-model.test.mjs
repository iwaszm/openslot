import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateAppointmentsByLane,
  calculateScheduleLoad,
  getCoverageEdgeClasses,
  getDateLoadStatus,
  getOccupiedEdgeClasses,
  groupLanesByStaff,
} from "../../src/admin/schedule-model.mjs";
import { renderAdminSchedule } from "../../src/admin/schedule-view.mjs";

const lanes = [
  { laneKey: "a", staffKey: "linda", staffId: "1", staffShortName: "L", staffAcceptsOnline: true },
  { laneKey: "b", staffKey: "linda", staffId: "1", staffShortName: "L", staffAcceptsOnline: true },
  { laneKey: "c", staffKey: "tony", staffId: "2", staffShortName: "T", staffAcceptsOnline: false },
];

test("groups the two lanes belonging to each employee", () => {
  const groups = groupLanesByStaff(lanes);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].lanes.map((lane) => lane.laneKey), ["a", "b"]);
});

test("allocates overlapping appointments across employee lanes", () => {
  const allocated = allocateAppointmentsByLane([
    { id: "one", startMinutes: 600, endMinutes: 660 },
    { id: "two", startMinutes: 600, endMinutes: 630 },
  ], lanes.slice(0, 2));
  assert.deepEqual(allocated.get("a").map((item) => item.id), ["one"]);
  assert.deepEqual(allocated.get("b").map((item) => item.id), ["two"]);
});

test("creates correct solid and connected edge classes", () => {
  assert.match(getOccupiedEdgeClasses({ occupiedMinutes: [600] }, 600), /booking-single/);
  assert.match(getCoverageEdgeClasses({ startMinutes: 600, endMinutes: 660 }, 600), /booking-first/);
  assert.match(getCoverageEdgeClasses({ startMinutes: 600, endMinutes: 660 }, 630), /booking-last/);
});

test("schedule load only counts online employee lanes", () => {
  const load = calculateScheduleLoad({
    appointments: [{ startMinutes: 600, endMinutes: 630, occupiedMinutes: [600], status: "confirmed" }],
    manualEntries: [],
    daySettings: { openMinutes: 600, closeMinutes: 660 },
    timeBlocks: [],
    laneLayout: lanes,
  });
  assert.deepEqual(load, { occupiedSlotCount: 1, totalSlotCount: 4 });
});

test("maps load ratios to calendar status colors", () => {
  assert.equal(getDateLoadStatus({ isBusinessDay: true, occupiedSlotCount: 0, totalSlotCount: 10 }), "date-load-green");
  assert.equal(getDateLoadStatus({ isBusinessDay: true, occupiedSlotCount: 10, totalSlotCount: 10 }), "date-load-full");
});

test("renders employee columns and appointment details", () => {
  const html = renderAdminSchedule({
    slots: [{ startMinutes: 600, endMinutes: 630 }],
    lanes: [
      {
        ...lanes[0],
        staffName: "Linda",
        staffColor: "#00ff00",
        appointments: [{ id: "a1", name: "Ada", serviceId: "cut", startMinutes: 600, endMinutes: 630 }],
        manual: [],
      },
      { ...lanes[1], staffName: "Linda", staffColor: "#00ff00", appointments: [], manual: [] },
    ],
    daySettings: { openMinutes: 600, closeMinutes: 630, isBlockedDay: false },
    timeBlocks: [],
    selectedDate: "2026-10-12",
    translate: (key) => key,
    canEditLane: () => true,
    canManageTimeBlock: () => true,
    serviceForItem: () => ({ shortName: "Cut", slotColor: "#abcdef" }),
    getServiceAbbrev: (service) => service.shortName,
    toDateInputValue: () => "2026-10-11",
    now: new Date("2026-10-11T11:00:00"),
  });
  assert.match(html, /aria-label="L"/);
  assert.match(html, /Cut/);
  assert.match(html, /Ada/);
  assert.match(html, /data-event-detail="a1"/);
  assert.match(html, /class="calendar-event full"/);
  assert.match(html, /data-create-staff="linda" data-create-start="600"/);
  assert.ok(html.indexOf("10:00-10:30") < html.indexOf("<strong>Cut</strong>"));
  assert.ok(html.indexOf("<strong>Cut</strong>") < html.indexOf("Ada"));
});

test("does not render quick-create targets on a blocked day", () => {
  const html = renderAdminSchedule({
    slots: [{ startMinutes: 600, endMinutes: 630 }],
    lanes: [{ ...lanes[0], staffName: "Linda", appointments: [], manual: [] }],
    daySettings: { openMinutes: 600, closeMinutes: 630, isBlockedDay: true },
    timeBlocks: [], selectedDate: "2026-10-12", translate: (key) => key,
    canEditLane: () => true, canManageTimeBlock: () => true,
    serviceForItem: () => null, getServiceAbbrev: () => "", toDateInputValue: () => "2026-10-11",
  });
  assert.doesNotMatch(html, /data-create-staff/);
});

test("does not render a quick-create target when both employee lanes are occupied", () => {
  const html = renderAdminSchedule({
    slots: [{ startMinutes: 600, endMinutes: 630 }],
    lanes: [
      { ...lanes[0], staffName: "Linda", appointments: [{ id: "a1", startMinutes: 600, endMinutes: 630 }], manual: [] },
      { ...lanes[1], staffName: "Linda", appointments: [], manual: [{ id: "m1", serviceId: "cut", startMinutes: 600, endMinutes: 660 }] },
    ],
    daySettings: { openMinutes: 600, closeMinutes: 630, isBlockedDay: false },
    timeBlocks: [], selectedDate: "2026-10-12", translate: (key) => key,
    canEditLane: () => true, canManageTimeBlock: () => true,
    serviceForItem: () => ({ shortName: "Cut" }), getServiceAbbrev: (service) => service.shortName,
    toDateInputValue: () => "2026-10-11",
  });
  assert.doesNotMatch(html, /data-create-staff="linda" data-create-start="600"/);
});
