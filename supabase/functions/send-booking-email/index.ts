import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type MailEvent = "created" | "cancelled";

type BookingRow = {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_token: string;
  cancelled_by: string | null;
  services: {
    name: string;
    duration_minutes: number;
    price: number;
  } | null;
  customers: {
    name: string;
    phone: string;
    email: string;
    gender: string;
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
    const { booking_id, event_type } = await req.json();
    if (!isUuid(booking_id)) return json({ error: "Invalid booking_id" }, 400);
    if (!isMailEvent(event_type)) return json({ error: "Invalid event_type" }, 400);

    const env = readEnv();
    const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const booking = await loadBooking(supabase, booking_id);
    if (!booking.customers || !booking.services) return json({ error: "Booking details are incomplete" }, 404);

    const result = await sendOnce({
      supabase,
      resendApiKey: env.resendApiKey,
      from: env.mailFrom,
      publicSiteUrl: env.publicSiteUrl,
      supabaseUrl: env.supabaseUrl,
      booking,
      event: event_type,
      recipientEmail: booking.customers.email,
    });

    return json({ ok: true, results: [result] });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function readEnv() {
  const env = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    resendApiKey: Deno.env.get("RESEND_API_KEY") || "",
    mailFrom: Deno.env.get("MAIL_FROM") || "",
    publicSiteUrl: Deno.env.get("PUBLIC_SITE_URL") || "",
  };
  const missing = Object.entries(env)
    .filter(([key, value]) => key !== "publicSiteUrl" && !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new Error(`Missing function secrets: ${missing.join(", ")}`);
  return env;
}

async function loadBooking(supabase: ReturnType<typeof createClient>, bookingId: string): Promise<BookingRow> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, end_time, status, cancellation_token, cancelled_by, services(name, duration_minutes, price), customers(name, phone, email, gender)")
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  return data as unknown as BookingRow;
}

async function sendOnce(options: {
  supabase: ReturnType<typeof createClient>;
  resendApiKey: string;
  from: string;
  publicSiteUrl: string;
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
  const serviceName = booking.services?.name || "Termin";
  if (event === "created") return `Terminbestätigung: ${serviceName} am ${formatDateTime(booking)}`;
  return `Stornierungsbestätigung: ${serviceName} am ${formatDateTime(booking)}`;
}

function buildHtml(booking: BookingRow, event: MailEvent, supabaseUrl: string) {
  const customer = booking.customers!;
  const service = booking.services!;
  const title = event === "created" ? "Ihr Termin ist bestätigt" : "Ihr Termin wurde storniert";
  const intro = event === "created"
    ? "Vielen Dank fuer Ihre Buchung. Wir haben Ihren Termin erhalten und freuen uns auf Ihren Besuch."
    : "Ihre Stornierung wurde gespeichert. Der Termin ist nicht mehr reserviert.";
  const cancelUrl = event === "created" ? buildCancelUrl(supabaseUrl, booking.cancellation_token) : "";
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1a16;max-width:620px">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(intro)}</p>

      <h3 style="margin-top:24px">Termindetails</h3>
      <p><strong>Service:</strong> ${escapeHtml(service.name)}</p>
      <p><strong>Datum:</strong> ${escapeHtml(formatGermanDate(booking.appointment_date))}</p>
      <p><strong>Uhrzeit:</strong> ${escapeHtml(formatTimeRange(booking))}</p>
      <p><strong>Name:</strong> ${escapeHtml(customer.name)}</p>
      <p><strong>Buchungsnummer:</strong> ${escapeHtml(booking.id)}</p>

      ${cancelUrl ? `
        <p style="margin:28px 0">
          <a href="${escapeHtml(cancelUrl)}" style="display:inline-block;background:#1d1a16;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">
            Termin stornieren
          </a>
        </p>
        <p style="font-size:13px;color:#6f675d">Falls Sie den Termin nicht wahrnehmen koennen, stornieren Sie ihn bitte ueber diesen Link.</p>
      ` : ""}

      <h3 style="margin-top:24px">Saloninformationen</h3>
      <p><strong>Berlin Hair Salon</strong></p>
      <p>Niebuhrstrasse 66, 10629 Berlin</p>
      <p>Telefon: <a href="tel:+4917641164231">0176 41164231</a></p>
      <p>Oeffnungszeiten:<br>
        Montag bis Freitag: 10:00-18:00<br>
        Samstag: 10:00-17:00<br>
        Sonntag: geschlossen
      </p>
    </div>
  `;
}

function buildText(booking: BookingRow, event: MailEvent, supabaseUrl: string) {
  const customer = booking.customers!;
  const service = booking.services!;
  const title = event === "created" ? "Ihr Termin ist bestaetigt" : "Ihr Termin wurde storniert";
  const cancelUrl = event === "created" ? buildCancelUrl(supabaseUrl, booking.cancellation_token) : "";
  return [
    title,
    "",
    "Termindetails",
    `Service: ${service.name}`,
    `Datum: ${formatGermanDate(booking.appointment_date)}`,
    `Uhrzeit: ${formatTimeRange(booking)}`,
    `Name: ${customer.name}`,
    `Buchungsnummer: ${booking.id}`,
    cancelUrl ? `Termin stornieren: ${cancelUrl}` : "",
    "",
    "Saloninformationen",
    "Berlin Hair Salon",
    "Niebuhrstrasse 66, 10629 Berlin",
    "Telefon: 0176 41164231",
    "Oeffnungszeiten: Montag bis Freitag 10:00-18:00, Samstag 10:00-17:00, Sonntag geschlossen",
  ].filter(Boolean).join("\n");
}

function buildCancelUrl(supabaseUrl: string, cancellationToken: string) {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/cancel-booking?token=${encodeURIComponent(cancellationToken)}`;
}

function formatDateTime(booking: BookingRow) {
  return `${formatGermanDate(booking.appointment_date)}, ${formatTimeRange(booking)}`;
}

function formatGermanDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
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

function formatBerlinTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function isMailEvent(value: unknown): value is MailEvent {
  return value === "created" || value === "cancelled";
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
