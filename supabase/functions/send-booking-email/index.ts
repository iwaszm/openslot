import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type MailEvent = "created" | "cancelled";
type Language = "de" | "en" | "zh";

const copy = {
  de: {
    subject: { created: "Terminbestätigung", cancelled: "Termin storniert" },
    title: { created: "Ihr Termin ist bestätigt", cancelled: "Ihr Termin wurde storniert" },
    intro: {
      created: "Vielen Dank für Ihre Buchung. Wir freuen uns auf Ihren Besuch.",
      cancelled: "Ihre Stornierung wurde gespeichert. Der Termin ist nicht mehr reserviert.",
    },
    details: "Termindetails", service: "Service", date: "Datum", time: "Uhrzeit", name: "Name",
    salonInfo: "Saloninformationen", phone: "Telefon", openingHours: "Öffnungszeiten", closed: "geschlossen",
    cancelBefore: "Falls Sie den Termin nicht wahrnehmen können, können Sie ihn ", cancelLink: "hier stornieren", cancelAfter: ".",
    cancelText: "Termin stornieren",
    days: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
  },
  en: {
    subject: { created: "Appointment confirmed", cancelled: "Appointment cancelled" },
    title: { created: "Your appointment is confirmed", cancelled: "Your appointment has been cancelled" },
    intro: {
      created: "Thank you for your booking. We look forward to seeing you.",
      cancelled: "Your cancellation has been saved. The appointment is no longer reserved.",
    },
    details: "Appointment details", service: "Service", date: "Date", time: "Time", name: "Name",
    salonInfo: "Salon information", phone: "Phone", openingHours: "Opening hours", closed: "Closed",
    cancelBefore: "If you cannot attend, you can ", cancelLink: "cancel your appointment here", cancelAfter: ".",
    cancelText: "Cancel appointment",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  zh: {
    subject: { created: "预约确认", cancelled: "预约已取消" },
    title: { created: "您的预约已确认", cancelled: "您的预约已取消" },
    intro: {
      created: "感谢您的预约，期待您的光临。",
      cancelled: "您的取消已保存，该时间不再为您保留。",
    },
    details: "预约详情", service: "服务", date: "日期", time: "时间", name: "姓名",
    salonInfo: "店铺信息", phone: "电话", openingHours: "营业时间", closed: "休息",
    cancelBefore: "如果您无法前来，可以", cancelLink: "点击这里取消预约", cancelAfter: "。",
    cancelText: "取消预约",
    days: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
  },
} satisfies Record<Language, Record<string, unknown>>;

type BookingRow = {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_token: string;
  cancelled_by: string | null;
  customer_language: "de" | "en" | "zh";
  service_snapshot: {
    name?: string;
    nameEn?: string;
    nameZh?: string;
  } | null;
  services: {
    name: string;
    name_en: string | null;
    name_zh: string | null;
    duration_minutes: number;
    price: number;
  } | null;
  customers: {
    name: string;
    phone: string;
    email: string;
    gender: string;
  } | null;
  salons: {
    id: string;
    name: string;
    address: string;
    phone: string;
    opening_hours: Record<string, string>;
  } | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { booking_id } = await req.json();
    if (!isUuid(booking_id)) return json({ error: "Invalid booking_id" }, 400);

    const env = readEnv();
    const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const booking = await loadBooking(supabase, booking_id);
    if (!booking.customers || !booking.services || !booking.salons) return json({ error: "Booking details are incomplete" }, 404);
    await authorizeCaller(req, env, supabase, booking.salons.id);
    const event = eventForBookingStatus(booking.status);

    const result = await sendOnce({
      supabase,
      resendApiKey: env.resendApiKey,
      from: env.mailFrom,
      supabaseUrl: env.supabaseUrl,
      booking,
      event,
      recipientEmail: booking.customers.email,
    });

    const emailStatus = result.status === "skipped" ? "sent" : result.status;
    return json({ ok: true, email_status: emailStatus, results: [result] });
  } catch (error) {
    console.error("Booking email failed", error);
    if (error instanceof HttpError) return json({ error: error.publicMessage, code: error.code }, error.status);
    return json({ error: "Email delivery failed", code: "EMAIL_DELIVERY_FAILED" }, 500);
  }
});

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

function readEnv() {
  const env = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    resendApiKey: Deno.env.get("RESEND_API_KEY") || "",
    mailFrom: Deno.env.get("MAIL_FROM") || "",
    publicBaseUrl: Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("PUBLIC_SITE_URL") || "",
  };
  const missing = Object.entries(env)
    .filter(([key, value]) => key !== "publicBaseUrl" && !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new Error(`Missing function secrets: ${missing.join(", ")}`);
  return env;
}

async function loadBooking(supabase: ReturnType<typeof createClient>, bookingId: string): Promise<BookingRow> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, end_time, status, cancellation_token, cancelled_by, customer_language, service_snapshot, services:services!appointments_service_salon_fkey(name, name_en, name_zh, duration_minutes, price), customers:customers!appointments_customer_salon_fkey(name, phone, email, gender), salons(id, name, address, phone, opening_hours)")
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  return data as unknown as BookingRow;
}

async function authorizeCaller(
  req: Request,
  env: ReturnType<typeof readEnv>,
  supabase: ReturnType<typeof createClient>,
  salonId: string,
) {
  const authorization = req.headers.get("Authorization") || "";
  if (authorization === `Bearer ${env.serviceRoleKey}`) return;

  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token) throw new HttpError(401, "AUTH_REQUIRED", "Authentication required");

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new HttpError(401, "AUTH_REQUIRED", "Authentication required");

  const { data: memberships, error: membershipError } = await supabase
    .from("salon_members")
    .select("salon_id, role")
    .eq("user_id", userData.user.id);
  if (membershipError) throw membershipError;

  const allowed = (memberships || []).some((membership) =>
    ["admin", "super_admin"].includes(membership.role) || membership.salon_id === salonId
  );
  if (!allowed) throw new HttpError(403, "ACCESS_DENIED", "Access denied");
}

function eventForBookingStatus(status: string): MailEvent {
  if (status === "confirmed") return "created";
  if (status === "cancelled") return "cancelled";
  throw new HttpError(409, "EMAIL_EVENT_NOT_ALLOWED", "The booking state does not allow an email event");
}

async function sendOnce(options: {
  supabase: ReturnType<typeof createClient>;
  resendApiKey: string;
  from: string;
  supabaseUrl: string;
  booking: BookingRow;
  event: MailEvent;
  recipientEmail: string;
}) {
  const emailEventType = `booking_${options.event}_customer`;
  const existing = await options.supabase
    .from("email_events")
    .select("id, status, resend_email_id")
    .eq("booking_id", options.booking.id)
    .eq("event_type", emailEventType)
    .eq("recipient", options.recipientEmail)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data?.status === "sent") {
    return { recipient: options.recipientEmail, event_type: emailEventType, status: "skipped", reason: "already sent" };
  }

  const eventId = existing.data?.id || crypto.randomUUID();
  if (!existing.data) {
    const { error } = await options.supabase.from("email_events").insert({
      id: eventId,
      booking_id: options.booking.id,
      event_type: emailEventType,
      recipient: options.recipientEmail,
      status: "pending",
    });
    if (error) throw error;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: [options.recipientEmail],
      subject: buildSubject(options.booking, options.event),
      html: buildHtml(options.booking, options.event, options.supabaseUrl),
      text: buildText(options.booking, options.event, options.supabaseUrl),
      attachments: options.event === "created" ? [buildCalendarAttachment(options.booking)] : undefined,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = String(payload?.message || payload?.error || `Resend error ${response.status}`);
    await options.supabase.from("email_events").update({
      status: "failed",
      error_message: errorMessage,
    }).eq("id", eventId);
    return { recipient: options.recipientEmail, event_type: emailEventType, status: "failed", error: errorMessage };
  }

  await options.supabase.from("email_events").update({
    status: "sent",
    resend_email_id: payload?.id || null,
    error_message: null,
    sent_at: new Date().toISOString(),
  }).eq("id", eventId);

  return { recipient: options.recipientEmail, event_type: emailEventType, status: "sent", resend_email_id: payload?.id || null };
}

function buildSubject(booking: BookingRow, event: MailEvent) {
  const language = normalizeLanguage(booking.customer_language);
  const serviceName = localizedServiceName(booking, language);
  const prefix = copy[language].subject[event];
  return `${prefix}: ${serviceName} · ${formatDateTime(booking, language)}`;
}

function buildHtml(booking: BookingRow, event: MailEvent, supabaseUrl: string) {
  const language = normalizeLanguage(booking.customer_language);
  const labels = copy[language];
  const customer = booking.customers!;
  const salon = booking.salons!;
  const cancelUrl = event === "created" ? buildCancelUrl(supabaseUrl, booking.cancellation_token) : "";
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1a16;max-width:620px">
      <h2>${escapeHtml(labels.title[event])}</h2>
      <p>${escapeHtml(labels.intro[event])}</p>

      <h3 style="margin-top:24px">${escapeHtml(labels.details)}</h3>
      <p><strong>${escapeHtml(labels.service)}:</strong> ${escapeHtml(localizedServiceName(booking, language))}</p>
      <p><strong>${escapeHtml(labels.date)}:</strong> ${escapeHtml(formatDate(booking.appointment_date, language))}</p>
      <p><strong>${escapeHtml(labels.time)}:</strong> ${escapeHtml(formatTimeRange(booking))}</p>
      <p><strong>${escapeHtml(labels.name)}:</strong> ${escapeHtml(customer.name)}</p>

      <h3 style="margin-top:24px">${escapeHtml(labels.salonInfo)}</h3>
      <p><strong>${escapeHtml(salon.name)}</strong></p>
      ${salon.address ? `<p>${escapeHtml(salon.address)}</p>` : ""}
      ${salon.phone ? `<p>${escapeHtml(labels.phone)}: <a href="tel:${escapeHtml(normalizePhoneHref(salon.phone))}">${escapeHtml(salon.phone)}</a></p>` : ""}
      <p>${escapeHtml(labels.openingHours)}:<br>${formatOpeningHoursHtml(salon.opening_hours, language)}</p>

      ${cancelUrl ? `
        <p style="margin-top:28px;font-size:13px;color:#6f675d">
          ${escapeHtml(labels.cancelBefore)}
          <a href="${escapeHtml(cancelUrl)}" style="color:#6f675d;text-decoration:underline">${escapeHtml(labels.cancelLink)}</a>${escapeHtml(labels.cancelAfter)}
        </p>
      ` : ""}
    </div>
  `;
}

function buildText(booking: BookingRow, event: MailEvent, supabaseUrl: string) {
  const language = normalizeLanguage(booking.customer_language);
  const labels = copy[language];
  const customer = booking.customers!;
  const salon = booking.salons!;
  const cancelUrl = event === "created" ? buildCancelUrl(supabaseUrl, booking.cancellation_token) : "";
  return [
    labels.title[event],
    labels.intro[event],
    "",
    labels.details,
    `${labels.service}: ${localizedServiceName(booking, language)}`,
    `${labels.date}: ${formatDate(booking.appointment_date, language)}`,
    `${labels.time}: ${formatTimeRange(booking)}`,
    `${labels.name}: ${customer.name}`,
    cancelUrl ? `${labels.cancelText}: ${cancelUrl}` : "",
    "",
    labels.salonInfo,
    salon.name,
    salon.address,
    salon.phone ? `${labels.phone}: ${salon.phone}` : "",
    `${labels.openingHours}: ${formatOpeningHoursText(salon.opening_hours, language)}`,
  ].filter(Boolean).join("\n");
}

function buildCancelUrl(supabaseUrl: string, cancellationToken: string) {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/cancel-booking?token=${encodeURIComponent(cancellationToken)}`;
}

function normalizeLanguage(value: unknown): Language {
  return value === "en" || value === "zh" ? value : "de";
}

function localeFor(language: Language) {
  return language === "en" ? "en-GB" : language === "zh" ? "zh-CN" : "de-DE";
}

function localizedServiceName(booking: BookingRow, language: Language) {
  const service = booking.services;
  const snapshot = booking.service_snapshot;
  const fallback = snapshot?.name || service?.name || (language === "zh" ? "预约" : language === "en" ? "Appointment" : "Termin");
  if (language === "en") return snapshot?.nameEn || service?.name_en || fallback;
  if (language === "zh") return snapshot?.nameZh || service?.name_zh || fallback;
  return fallback;
}

function localizeClosed(value: string, language: Language) {
  return /^(geschlossen|closed|休息)$/i.test(String(value).trim()) ? copy[language].closed : value;
}

function formatDateTime(booking: BookingRow, language: Language) {
  return `${formatDate(booking.appointment_date, language)}, ${formatTimeRange(booking)}`;
}

function formatDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${value}T12:00:00+01:00`));
}

function formatTimeRange(booking: BookingRow) {
  return `${formatBerlinTime(booking.start_time)}-${formatBerlinTime(booking.end_time)}`;
}

function formatOpeningHoursHtml(openingHours: Record<string, string>, language: Language) {
  return Object.entries(normalizeOpeningHours(openingHours, language))
    .map(([day, hours]) => `${escapeHtml(day)}: ${escapeHtml(hours)}`)
    .join("<br>");
}

function formatOpeningHoursText(openingHours: Record<string, string>, language: Language) {
  return Object.entries(normalizeOpeningHours(openingHours, language))
    .map(([day, hours]) => `${day}: ${hours}`)
    .join(", ");
}

function normalizeOpeningHours(openingHours: Record<string, string>, language: Language) {
  const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const defaults = ["10:00-18:00", "10:00-18:00", "10:00-18:00", "10:00-18:00", "10:00-18:00", "10:00-17:00", copy[language].closed];
  return Object.fromEntries(keys.map((key, index) => [
    copy[language].days[index],
    localizeClosed(openingHours?.[key] || defaults[index], language),
  ]));
}

function normalizePhoneHref(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function formatBerlinTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCalendarAttachment(booking: BookingRow) {
  const salon = booking.salons!;
  const language = normalizeLanguage(booking.customer_language);
  const serviceName = localizedServiceName(booking, language);
  const start = toIcsUtc(booking.start_time);
  const end = toIcsUtc(booking.end_time);
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenSlot Berlin//Booking//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${booking.id}@openslotberlin.de`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcs(`${serviceName} · ${salon.name}`)}`,
    `LOCATION:${escapeIcs(salon.address || "")}`,
    `DESCRIPTION:${escapeIcs(`${serviceName}\\n${salon.phone || ""}`)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return {
    filename: "appointment.ics",
    content: base64Utf8(content),
    content_type: "text/calendar; charset=utf-8; method=REQUEST",
  };
}

function toIcsUtc(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");
}

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
