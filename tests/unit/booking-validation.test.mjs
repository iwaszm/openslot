import test from "node:test";
import assert from "node:assert/strict";

import { canSubmitBooking, getBookingErrorKey, validateCustomerValues } from "../../src/booking/booking-validation.mjs";

test("validates customer values without DOM dependencies", () => {
  assert.deepEqual(validateCustomerValues({ name: "1", phone: "030 123456", email: "a@example.com" }), {
    field: "name",
    messageKey: "customer.nameTooShort",
  });
  assert.deepEqual(validateCustomerValues({ name: "Anna", phone: "abc", email: "a@example.com" }), {
    field: "phone",
    messageKey: "customer.phoneInvalid",
  });
  assert.equal(validateCustomerValues({ name: "Anna", phone: "+49 30 123456", email: "a@example.com" }), null);
});

test("maps server conflict and validation errors to translation keys", () => {
  assert.equal(getBookingErrorKey({ code: "SLOT_UNAVAILABLE" }), "customer.bookingConflict");
  assert.equal(getBookingErrorKey({ message: "Invalid email" }), "customer.emailInvalid");
  assert.equal(getBookingErrorKey({ message: "unexpected" }), "customer.bookingFailed");
});

test("enables booking only after service, date, slot and required security token are ready", () => {
  const ready = { hasService: true, date: "2026-10-12", slot: "10:00" };
  assert.equal(canSubmitBooking(ready), true);
  assert.equal(canSubmitBooking({ ...ready, hasService: false }), false);
  assert.equal(canSubmitBooking({ ...ready, date: "" }), false);
  assert.equal(canSubmitBooking({ ...ready, slot: "" }), false);
  assert.equal(canSubmitBooking({ ...ready, requiresTurnstile: true }), false);
  assert.equal(canSubmitBooking({ ...ready, requiresTurnstile: true, turnstileToken: "verified" }), true);
});
