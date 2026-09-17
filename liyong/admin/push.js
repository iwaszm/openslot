(() => {
  const button = document.querySelector("#pushToggleButton");
  const config = window.OPENSLOT_SUPABASE || {};
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const client = window.OpenSlotAdminClient || null;
  let salonId = null;
  let userId = null;
  let registration = null;
  let subscription = null;
  let enabled = false;
  let busy = false;
  let refreshId = 0;

  function render() {
    const label = enabled ? "Benachrichtigungen deaktivieren" : "Benachrichtigungen aktivieren";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(enabled));
    button.dataset.enabled = String(enabled);
    button.title = !supported ? "Auf iPhone/iPad zuerst zum Home-Bildschirm hinzufügen."
      : Notification.permission === "denied" ? "Benachrichtigungen in den Geräteeinstellungen erlauben."
        : label;
    button.disabled = busy || !salonId || !userId || !navigator.onLine
      || (supported && Boolean(config.vapidPublicKey) && !registration);
  }

  async function getRegistration() {
    return (await navigator.serviceWorker.getRegistration("./"))
      || navigator.serviceWorker.register("./sw.js", { scope: "./" });
  }

  function decodeKey(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  function equalBytes(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  async function refresh() {
    const run = ++refreshId;
    if (!client) return;
    try {
      const { data, error: authError } = await client.auth.getUser();
      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      if (run !== refreshId) return;
      userId = data?.user?.id || null;
      salonId = null;
      registration = null;
      subscription = null;
      enabled = false;
      render();
      if (!userId) return;

      const [salonResult, memberResult] = await Promise.all([
        client.from("salons").select("id").eq("slug", "liyong").single(),
        client.from("salon_members").select("salon_id, role").eq("user_id", userId),
      ]);
      if (run !== refreshId) return;
      if (salonResult.error) throw salonResult.error;
      if (memberResult.error) throw memberResult.error;
      const salon = salonResult.data;
      if (!memberResult.data?.some((member) => member.role === "super_admin" || member.salon_id === salon.id)) return;
      salonId = salon.id;
      if (!supported || !config.vapidPublicKey) return;

      registration = await getRegistration();
      subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const key = subscription.options?.applicationServerKey;
        if (key && !equalBytes(new Uint8Array(key), decodeKey(config.vapidPublicKey))) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      if (run !== refreshId) return;
      if (subscription && Notification.permission === "granted") {
        const { data: existing, error } = await client.from("push_subscriptions")
          .select("id")
          .eq("salon_id", salonId)
          .eq("user_id", userId)
          .eq("endpoint", subscription.endpoint)
          .maybeSingle();
        if (error) throw error;
        if (run !== refreshId) return;
        enabled = Boolean(existing);
      }
    } catch (error) {
      console.warn("Push status unavailable:", error);
    } finally {
      if (run === refreshId) render();
    }
  }

  async function enable() {
    if (!supported) {
      alert("Auf iPhone/iPad die Terminverwaltung zuerst zum Home-Bildschirm hinzufügen und von dort öffnen.");
      return;
    }
    if (!config.vapidPublicKey) {
      alert("Benachrichtigungen sind noch nicht eingerichtet.");
      return;
    }
    if (Notification.permission === "denied") {
      alert("Benachrichtigungen sind blockiert. Bitte in den Geräteeinstellungen für diese App erlauben und erneut auf die Glocke tippen.");
      return;
    }

    // Start the browser subscription directly from the button gesture (required on iOS).
    const currentSalonId = salonId;
    const currentUserId = userId;
    busy = true;
    render();
    try {
      const pending = subscription ? Promise.resolve(subscription) : registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(config.vapidPublicKey),
      });
      subscription = await pending;
      const { data: existing, error: lookupError } = await client.from("push_subscriptions")
        .select("id")
        .eq("salon_id", currentSalonId)
        .eq("user_id", currentUserId)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) {
        const { error } = await client.from("push_subscriptions").insert({
          salon_id: currentSalonId,
          user_id: currentUserId,
          endpoint: subscription.endpoint,
        });
        if (error) throw error;
      }
      enabled = true;
    } catch (error) {
      console.warn("Push subscription failed:", error);
      alert(Notification.permission === "denied"
        ? "Benachrichtigungen sind blockiert. Bitte in den Geräteeinstellungen erlauben."
        : "Benachrichtigungen konnten nicht aktiviert werden. Bitte erneut versuchen.");
    } finally {
      busy = false;
      render();
    }
  }

  async function disable() {
    const currentSubscription = subscription;
    const currentSalonId = salonId;
    const currentUserId = userId;
    busy = true;
    render();
    try {
      const { error } = await client.from("push_subscriptions")
        .delete()
        .eq("salon_id", currentSalonId)
        .eq("user_id", currentUserId)
        .eq("endpoint", currentSubscription.endpoint);
      if (error) throw error;
      await currentSubscription.unsubscribe();
      subscription = null;
      enabled = false;
    } catch (error) {
      console.warn("Push unsubscribe failed:", error);
      alert("Benachrichtigungen konnten nicht deaktiviert werden. Bitte erneut versuchen.");
    } finally {
      busy = false;
      render();
    }
  }

  button.addEventListener("click", () => {
    if (busy || !salonId || !userId || !navigator.onLine) return;
    if (enabled) disable();
    else enable();
  });
  window.addEventListener("online", refresh);
  window.addEventListener("offline", render);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  if (client) client.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
