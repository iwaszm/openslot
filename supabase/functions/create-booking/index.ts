import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { generateRequestDetails } from "npm:web-push@3.6.7";

type BookingRequest = {
  salon_slug?: string;
  service_id?: string;
  appointment_date?: string;
  start_time?: string;
  gender?: string;
  name?: string;
  phone?: string;
  email?: string;
  turnstile_token?: string;
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
    const env = readEnv();
    const payload = await req.json() as BookingRequest;
    const validationError = validatePayload(payload);
    if (validationError) return json({ error: validationError }, 400);

    const turnstileResult = await verifyTurnstile({
      secretKey: env.turnstileSecretKey,
      token: payload.turnstile_token || "",
      remoteIp: req.headers.get("CF-Connecting-IP") || "",
    });
    if (!turnstileResult.success) {
      return json({ error: "Turnstile verification failed" }, 403);
    }

    const supabase = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("create_public_booking", {
      p_salon_slug: payload.salon_slug,
      p_service_id: payload.service_id,
      p_appointment_date: payload.appointment_date,
      p_start_time: payload.start_time,
      p_gender: payload.gender,
      p_name: payload.name,
      p_phone: payload.phone,
      p_email: payload.email,
    });

    if (error) throw error;
    if (payload.salon_slug === "liyong" || payload.salon_slug === "lisa") {
      try {
        await notifyNewBooking(supabase, data, env);
      } catch (pushError) {
        console.error("Booking push failed:", pushError);
      }
    }
    return json({ ok: true, booking_id: data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function readEnv() {
  const env = {
    supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    turnstileSecretKey: Deno.env.get("TURNSTILE_SECRET_KEY") || "",
    vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY") || "",
    vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY") || "",
  };
  const missing = ["supabaseUrl", "serviceRoleKey", "turnstileSecretKey"].filter((key) => !env[key as keyof typeof env]);
  if (missing.length > 0) throw new Error(`Missing function secrets: ${missing.join(", ")}`);
  return env;
}

async function notifyNewBooking(
  supabase: ReturnType<typeof createClient>,
  bookingId: string,
  env: ReturnType<typeof readEnv>,
) {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return;

  const { data: booking, error: bookingError } = await supabase.from("appointments")
    .select("id, salon_id, salons!inner(slug)")
    .eq("id", bookingId)
    .single();
  if (bookingError) throw bookingError;
  if (!["liyong", "lisa"].includes((booking.salons as unknown as { slug: string }).slug)) return;

  const { error: dispatchError } = await supabase.from("booking_push_dispatches")
    .insert({ booking_id: booking.id });
  if (dispatchError?.code === "23505") return;
  if (dispatchError) throw dispatchError;

  const { data: subscriptions, error } = await supabase.from("push_subscriptions")
    .select("id, endpoint, user_id")
    .eq("salon_id", booking.salon_id)
    .limit(100);
  if (error) throw error;
  if (!subscriptions?.length) return;

  const { data: memberships, error: memberError } = await supabase.from("salon_members")
    .select("user_id, salon_id, role")
    .in("user_id", [...new Set(subscriptions.map((subscription) => subscription.user_id))]);
  if (memberError) throw memberError;
  const authorizedUsers = new Set((memberships || [])
    .filter((member) => ["admin", "super_admin"].includes(member.role) || member.salon_id === booking.salon_id)
    .map((member) => member.user_id));

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      if (!authorizedUsers.has(subscription.user_id)) {
        await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
        return;
      }
      if (!isTrustedPushEndpoint(subscription.endpoint)) throw new Error("Unsupported push endpoint");
      const request = generateRequestDetails({ endpoint: subscription.endpoint }, null, {
        vapidDetails: {
          subject: "https://openslotberlin.de",
          publicKey: env.vapidPublicKey,
          privateKey: env.vapidPrivateKey,
        },
        TTL: 3600,
        urgency: "high",
      });
      const headers = new Headers(request.headers);
      headers.delete("Content-Length");
      const response = await fetch(request.endpoint, {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404 || response.status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
      } else if (!response.ok) {
        throw new Error(`Push service returned ${response.status}`);
      }
    } catch (pushError) {
      console.error("Push delivery failed:", pushError);
    }
  }));
}

function isTrustedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!url.port || url.port === "443") && (
      url.hostname === "fcm.googleapis.com"
      || url.hostname === "web.push.apple.com"
      || url.hostname === "updates.push.services.mozilla.com"
      || url.hostname.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

function validatePayload(payload: BookingRequest) {
  if (!payload.salon_slug || !/^[a-z0-9-]+$/.test(payload.salon_slug)) return "Invalid salon_slug";
  if (!payload.service_id || payload.service_id.length > 120) return "Invalid service_id";
  if (!payload.appointment_date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.appointment_date)) return "Invalid appointment_date";
  if (!payload.start_time || !/^\d{2}:\d{2}(:\d{2})?$/.test(payload.start_time)) return "Invalid start_time";
  if (!payload.gender || !["male", "female"].includes(payload.gender)) return "Invalid gender";
  if (!payload.name || payload.name.trim().length < 2 || payload.name.trim().length > 50) return "Invalid name";
  if (!payload.phone || payload.phone.trim().length < 3 || payload.phone.trim().length > 50) return "Invalid phone";
  if (!payload.email || payload.email.trim().length > 50 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email.trim())) return "Invalid email";
  if (!payload.turnstile_token) return "Missing Turnstile token";
  return "";
}

async function verifyTurnstile(input: { secretKey: string; token: string; remoteIp: string }) {
  const formData = new FormData();
  formData.append("secret", input.secretKey);
  formData.append("response", input.token);
  if (input.remoteIp) formData.append("remoteip", input.remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) return { success: false };
  return await response.json() as { success: boolean; "error-codes"?: string[] };
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
