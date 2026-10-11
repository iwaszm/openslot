export function validateCustomerValues({ name, phone, email, emailValid = true }) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return { field: "name", messageKey: "customer.nameRequired" };
  if (normalizedName.length < 2) return { field: "name", messageKey: "customer.nameTooShort" };
  if (normalizedName.length > 50) return { field: "name", messageKey: "customer.nameTooLong" };
  if (/^\d+$/.test(normalizedName)) return { field: "name", messageKey: "customer.nameNotNumeric" };

  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) return { field: "phone", messageKey: "customer.phoneRequired" };
  if (normalizedPhone.length > 50) return { field: "phone", messageKey: "customer.phoneTooLong" };
  if (!/^\+?[0-9][0-9\s()/.-]{5,}$/.test(normalizedPhone)) {
    return { field: "phone", messageKey: "customer.phoneInvalid" };
  }

  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) return { field: "email", messageKey: "customer.emailRequired" };
  if (normalizedEmail.length > 50) return { field: "email", messageKey: "customer.emailTooLong" };
  if (!emailValid) return { field: "email", messageKey: "customer.emailInvalid" };
  return null;
}

export function getBookingErrorKey(error) {
  const message = error?.message || "";
  if (error?.code === "SLOT_UNAVAILABLE") return "customer.bookingConflict";
  if (error?.code === "SERVICE_UNAVAILABLE") return "customer.noServices";
  if (error?.code === "BOOKING_RATE_LIMITED") return "customer.tooManyAttempts";
  if (/outside working hours/i.test(message)) return "customer.timeOutsideHours";
  if (/This day is not available/i.test(message)) return "customer.dayUnavailable";
  if (/blocked slot/i.test(message)) return "customer.timeBlocked";
  if (/No complete service lane/i.test(message)) return "customer.noCompleteLane";
  if (/prevent_double_booking|conflict|overlap/i.test(message)) return "customer.bookingConflict";
  if (/Unknown or inactive service/i.test(message)) return "customer.noServices";
  if (/Invalid (customer )?name/i.test(message)) return "customer.nameNotNumeric";
  if (/Invalid phone/i.test(message)) return "customer.phoneInvalid";
  if (/Invalid email/i.test(message)) return "customer.emailInvalid";
  if (/Too many booking attempts/i.test(message)) return "customer.tooManyAttempts";
  if (/Turnstile|captcha|token/i.test(message)) return "customer.securityRequired";
  if (isConflictError(error)) return "customer.bookingConflict";
  return "customer.bookingFailed";
}

function isConflictError(error) {
  return ["23P01", "P0001", "23514", "SLOT_UNAVAILABLE"].includes(error?.code)
    || /conflict|prevent_double_booking|not available|outside working hours|blocked/i.test(error?.message || "");
}
