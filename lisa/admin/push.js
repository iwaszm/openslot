(() => {
  const config = window.OPENSLOT_SUPABASE || {};
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const client = window.OpenSlotAdminClient || null;
  let salonId = null;
  let userId = null;
  let busy = false;

  async function getRegistration() {
    return (await navigator.serviceWorker.getRegistration("./"))
      || navigator.serviceWorker.register("./sw.js", { scope: "./" });
  }

  async function refresh() {
    if (!client || !supported || !config.vapidPublicKey) return;
    try {
      const { data, error: authError } = await client.auth.getUser();
      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      userId = data?.user?.id || null;
      salonId = null;
      if (!userId) return;

      const [salonResult, memberResult] = await Promise.all([
        client.from("salons").select("id").eq("slug", "lisa").single(),
        client.from("salon_members").select("salon_id, role").eq("user_id", userId),
      ]);
      if (salonResult.error) throw salonResult.error;
      if (memberResult.error) throw memberResult.error;
      const salon = salonResult.data;
      if (!memberResult.data?.some((member) => member.role === "super_admin" || member.salon_id === salon.id)) return;
      salonId = salon.id;
      if (Notification.permission === "granted" && navigator.onLine) await subscribe();
    } catch (error) {
      console.warn("Push subscription unavailable:", error);
    }
  }

  function decodeKey(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  function equalBytes(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  async function subscribe() {
    if (busy || !salonId || !userId || !navigator.onLine) return;
    busy = true;
    try {
      const registration = await getRegistration();
      let subscription = await registration.pushManager.getSubscription();
      const expectedKey = decodeKey(config.vapidPublicKey);
      const existingKey = subscription?.options?.applicationServerKey;
      if (subscription && existingKey && !equalBytes(new Uint8Array(existingKey), expectedKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey,
        });
      }

      const { data: existing, error: lookupError } = await client.from("push_subscriptions")
        .select("id")
        .eq("salon_id", salonId)
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) {
        const { error } = await client.from("push_subscriptions").insert({
          salon_id: salonId,
          user_id: userId,
          endpoint: subscription.endpoint,
        });
        if (error) throw error;
      }
    } catch (error) {
      console.warn("Push subscription failed:", error);
    } finally {
      busy = false;
    }
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#ownerControls") || !salonId || !userId || !supported || !config.vapidPublicKey || !navigator.onLine) return;
    if (Notification.permission !== "default") return;
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") subscribe();
    }).catch((error) => console.warn("Notification permission unavailable:", error));
  });

  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  if (client) client.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
