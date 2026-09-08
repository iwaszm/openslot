import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

type BookingRow = {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_token: string;
  services: { name: string } | null;
  customers: { name: string; email: string } | null;
  salons: { name: string; phone: string } | null;
};

const htmlHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return renderPage("Methode nicht erlaubt", "Dieser Link kann nur im Browser geoeffnet werden.", 405);
  }

  try {
    const env = readEnv();
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    if (!isCancellationToken(token)) {
      return renderPage("Ungueltiger Link", "Der Stornierungslink ist ungueltig oder unvollstaendig.", 400);
    }

    const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const booking = await loadBooking(supabase, token);
    if (!booking) {
      return renderPage("Termin nicht gefunden", "Dieser Termin wurde nicht gefunden oder der Link ist abgelaufen.", 404);
    }

    if (booking.status === "cancelled") {
      return renderPage("Termin bereits storniert", buildDetails(booking), 200);
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_by: "customer",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .neq("status", "cancelled");
    if (error) throw error;

    await triggerCancellationEmail(env, booking.id);

    return renderPage("Termin storniert", buildDetails({ ...booking, status: "cancelled" }), 200);
  } catch (error) {
    return renderPage("Stornierung fehlgeschlagen", escapeHtml(error instanceof Error ? error.message : String(error)), 500);
  }
});

function readEnv() {
  const env = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
  const missing = Object.entries(env).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) throw new Error(`Missing function secrets: ${missing.join(", ")}`);
  return env;
}

async function loadBooking(supabase: ReturnType<typeof createClient>, token: string): Promise<BookingRow | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, end_time, status, cancellation_token, services(name), customers(name, email), salons(name, phone)")
    .eq("cancellation_token", token)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as BookingRow | null;
}

async function triggerCancellationEmail(env: { supabaseUrl: string; serviceRoleKey: string }, bookingId: string) {
  await fetch(`${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/send-booking-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ booking_id: bookingId, event_type: "cancelled" }),
  }).catch(() => null);
}

function buildDetails(booking: BookingRow) {
  const phone = booking.salons?.phone || "";
  return `
    <p>Ihre Stornierung wurde gespeichert.</p>
    <dl>
      <dt>Service</dt>
      <dd>${escapeHtml(booking.services?.name || "Termin")}</dd>
      <dt>Datum</dt>
      <dd>${escapeHtml(formatGermanDate(booking.appointment_date))}</dd>
      <dt>Uhrzeit</dt>
      <dd>${escapeHtml(formatTimeRange(booking))}</dd>
    </dl>
    ${phone ? `<p>Bei Fragen erreichen Sie ${escapeHtml(booking.salons?.name || "den Salon")} telefonisch unter <a href="tel:${escapeHtml(normalizePhoneHref(phone))}">${escapeHtml(phone)}</a>.</p>` : ""}
  `;
}

function renderPage(title: string, body: string, status = 200) {
  return new Response(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;background:#f7f3ee;color:#1d1a16}
      main{max-width:640px;margin:0 auto;padding:48px 20px}
      section{background:#fff;border:1px solid #e3d8cc;border-radius:8px;padding:28px}
      h1{font-size:28px;line-height:1.2;margin:0 0 18px}
      p,dd{line-height:1.6}
      dl{display:grid;grid-template-columns:100px 1fr;gap:8px 16px;margin:24px 0}
      dt{font-weight:700;color:#6f675d}
      dd{margin:0}
      a{color:#1d1a16}
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(title)}</h1>
        ${body}
      </section>
    </main>
  </body>
</html>`, { status, headers: htmlHeaders });
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

function formatGermanDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${value}T12:00:00+01:00`));
}

function isCancellationToken(value: string) {
  return /^[0-9a-f]{48}$/i.test(value);
}

function normalizePhoneHref(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
