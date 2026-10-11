import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDateRange,
  getBerlinHolidayName,
  getCalendarWeekStartIndex,
  getInitialBookingDate,
  isBusinessDay,
  normalizeDaySettings,
} from "../../src/booking/calendar.mjs";

test("calculates fixed and Easter-based Berlin holidays", () => {
  assert.equal(getBerlinHolidayName("2026-03-08"), "Internationaler Frauentag");
  assert.equal(getBerlinHolidayName("2026-04-03"), "Karfreitag");
  assert.equal(getBerlinHolidayName("2026-05-14"), "Christi Himmelfahrt");
  assert.equal(getBerlinHolidayName("2026-04-08"), "");
});

test("marks a closed weekly day as blocked", () => {
  const settings = normalizeDaySettings(
    { date: "2026-10-11", openMinutes: 540, closeMinutes: 1200, isBlockedDay: false },
    { openMinutes: null, closeMinutes: null },
    { openMinutes: 600, closeMinutes: 1080 },
  );
  assert.deepEqual(settings, {
    date: "2026-10-11",
    openMinutes: 600,
    closeMinutes: 1080,
    isBlockedDay: true,
  });
  assert.equal(isBusinessDay(settings, { openMinutes: null }), false);
});

test("builds a stable inclusive date range", () => {
  assert.deepEqual(buildDateRange(new Date("2026-10-11T12:00:00"), 3), [
    "2026-10-11",
    "2026-10-12",
    "2026-10-13",
  ]);
});

test("moves initial booking date past closing and closed days", () => {
  const date = getInitialBookingDate({
    now: new Date("2026-10-10T19:00:00"),
    days: 21,
    slotStep: 30,
    getWeeklyRule: (candidate) => candidate.getDay() === 0
      ? { openMinutes: null, closeMinutes: null }
      : { openMinutes: 600, closeMinutes: 1080 },
  });
  assert.equal(date, "2026-10-12");
});

test("calendar paging advances and returns to Monday boundaries", () => {
  const dates = buildDateRange(new Date("2026-10-11T12:00:00"), 21);
  assert.equal(getCalendarWeekStartIndex(dates, 0, 1, 7), 1);
  assert.equal(getCalendarWeekStartIndex(dates, 8, -1, 7), 1);
});
