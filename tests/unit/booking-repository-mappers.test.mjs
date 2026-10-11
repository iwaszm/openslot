import test from "node:test";
import assert from "node:assert/strict";

import {
  mapSupabaseDaySettings,
  mapSupabaseService,
} from "../../src/booking/supabase-booking-repository.mjs";

test("maps service catalog fields into the booking domain model", () => {
  const service = mapSupabaseService({
    id: "demo_cut",
    name: "Cut",
    short_name: "CUT",
    duration_minutes: 60,
    booked_slots: [1, 2],
    price: "42",
    price_from: true,
    is_active: true,
    accepts_online_bookings: true,
    sort_order: 3,
    service_categories: {
      id: "cuts",
      name: "Cuts",
      name_en: "Cuts",
      name_zh: "剪发",
      sort_order: 2,
    },
  });

  assert.equal(service.duration, 60);
  assert.equal(service.price, 42);
  assert.equal(service.priceFrom, true);
  assert.equal(service.categoryId, "cuts");
  assert.equal(service.categorySortOrder, 2);
});

test("maps effective day settings without browser globals", () => {
  const settings = mapSupabaseDaySettings({
    setting_date: "2026-10-12",
    open_time: "09:30:00",
    close_time: "18:00:00",
    is_blocked_day: false,
    holiday_name: "",
    is_public_holiday: false,
    has_manual_override: true,
  });

  assert.deepEqual(settings, {
    date: "2026-10-12",
    openMinutes: 570,
    closeMinutes: 1080,
    isBlockedDay: false,
    holidayName: "",
    isPublicHoliday: false,
    hasManualOverride: true,
  });
});
