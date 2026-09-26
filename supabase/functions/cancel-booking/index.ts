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
  salons: { slug: string; name: string; phone: string } | null;
};

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const publicBaseUrl = readPublicBaseUrl();

  try {
    const env = readEnv();
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    if (!isCancellationToken(token)) {
      return redirectToResult(publicBaseUrl, "invalid");
    }

    const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const booking = await loadBooking(supabase, token);
    if (!booking) {
      return redirectToResult(publicBaseUrl, "not-found");
    }

    if (booking.status === "cancelled") {
      return redirectToResult(publicBaseUrl, "already-cancelled", booking.salons?.slug);
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

    return redirectToResult(publicBaseUrl, "cancelled", booking.salons?.slug);
  } catch (error) {
    console.error("Cancellation failed", error);
    return redirectToResult(publicBaseUrl, "error");
  }
});

function readPublicBaseUrl() {
  return (Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("PUBLIC_SITE_URL") || "https://openslotberlin.de")
    .replace(/\/$/, "");
}

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
    .select("id, appointment_date, start_time, end_time, status, cancellation_token, services:services!appointments_service_salon_fkey(name), customers:customers!appointments_customer_salon_fkey(name, email), salons(slug, name, phone)")
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

function redirectToResult(publicBaseUrl: string, result: string, salonSlug = "") {
  const destination = new URL(`${publicBaseUrl}/stornierung/`);
  destination.searchParams.set("result", result);
  if (/^[a-z0-9-]+$/i.test(salonSlug)) destination.searchParams.set("salon", salonSlug);
  return Response.redirect(destination.toString(), 303);
}

function isCancellationToken(value: string) {
  return /^[0-9a-f]{48}$/i.test(value);
}
