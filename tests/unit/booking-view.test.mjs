import test from "node:test";
import assert from "node:assert/strict";

import { createSlotsHtml, createBookingSummaryHtml } from "../../src/booking/booking-view.mjs";

test("renders disabled unavailable slots and selected available slots", () => {
  const html = createSlotsHtml({
    slots: [
      { time: "10:00", available: true, reason: "" },
      { time: "10:30", available: false, reason: "Besetzt" },
    ],
    selectedSlot: "10:00",
    translate: () => "Frei",
  });
  assert.match(html, /available selected/);
  assert.match(html, /title="Besetzt" disabled/);
});

test("escapes customer-facing summary values", () => {
  const html = createBookingSummaryHtml({
    serviceName: "Cut <script>",
    serviceMeta: "30 Min.",
    dateLabel: "2026-10-12",
    timeLabel: "10:00-10:30",
  });
  assert.match(html, /Cut &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
