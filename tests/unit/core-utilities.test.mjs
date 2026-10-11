import test from "node:test";
import assert from "node:assert/strict";

import { escapeAttribute, escapeHtml } from "../../src/core/html.mjs";
import { dateToMinutes, formatMinutes, parseTime, timeValueToMinutes } from "../../src/core/time.mjs";

test("shared time helpers accept database time and timestamp values", () => {
  assert.equal(parseTime("10:30"), 630);
  assert.equal(dateToMinutes("10:30:00"), 630);
  assert.equal(timeValueToMinutes("10:30:00"), 630);
  assert.equal(formatMinutes(630), "10:30");
});

test("shared HTML helpers escape text and attribute delimiters", () => {
  assert.equal(escapeHtml('<Ada & "Bob">'), "&lt;Ada &amp; &quot;Bob&quot;&gt;");
  assert.equal(escapeAttribute("`value`"), "&#096;value&#096;");
});
