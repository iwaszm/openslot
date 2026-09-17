(() => {
  const button = document.querySelector("#pushToggleButton");
  const status = document.querySelector("#pushStatus");
  const config = window.OPENSLOT_SUPABASE || {};
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const client = window.OpenSlotAdminClient || null;
  let salonId = null;
  let userId = null;
  let enabled = false;
  let busy = false;

  function setStatus(message = "") {
    status.textContent = message;
  }

  function render() {
    button.textContent = enabled ? "Benachrichtigungen deaktivieren" : "Benachrichtigungen aktivieren";
    button.disabled = busy || !client || !supported || !config.vapidPublicKey || !salonId || !userId || !navigator.onLine;
    button.setAttribute("aria-pressed", String(enabled));
    if (!supported) button.title = "Push-Benachrichtigungen werden auf diesem Gerät nicht unterstützt.";
    else if (!config.vapidPublicKey) button.title = "Push ist noch nicht eingerichtet.";
    else button.removeAttribute("title");
  }

  async function getRegistration() {
    return (await navigator.serviceWorker.getRegistration("./"))
      || navigator.serviceWorker.register("./sw.js", { scope: "./" });
  }

  async function refresh() {
    if (!client || !supported || !config.vapidPublicKey) {
      if (!supported) setStatus("Push wird auf diesem Gerät nicht unterstützt.");
      else if (!config.vapidPublicKey) setStatus("Push ist noch nicht eingerichtet.");
      render();
      return;
    }
    try {
      const { data, error: authError } = await client.auth.getUser();
      if (authError && authError.name !== "AuthSessionMissingError") throw authError;
      const user = data?.user;
      userId = user?.id || null;
      salonId = null;
      enabled = false;
      if (userId) {
        const [salonResult, memberResult] = await Promise.all([
          client.from("salons").select("id").eq("slug", "liyong").single(),
          client.from("salon_members").select("salon_id, role").eq("user_id", userId),
        ]);
        if (salonResult.error) throw salonResult.error;
        if (memberResult.error) throw memberResult.error;
        const salon = salonResult.data;
        const allowed = memberResult.data?.some((member) => member.role === "super_admin" || member.salon_id === salon.id);
        if (allowed) {
          salonId = salon.id;
          const registration = await navigator.serviceWorker.getRegistration("./");
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription) {
            const { data, error } = await client.from("push_subscriptions")
              .select("id")
              .eq("salon_id", salon.id)
              .eq("user_id", userId)
              .eq("endpoint", subscription.endpoint)
              .maybeSingle();
            if (error) throw error;
            enabled = Boolean(data);
          }
        }
      }
      setStatus();
    } catch (error) {
      setStatus(`Push-Status konnte nicht geladen werden: ${error.message}`);
    }
    render();
  }

  function decodeKey(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Bitte Benachrichtigungen in den Browser-Einstellungen erlauben.");

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
    enabled = true;
  }

  function equalBytes(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration("./");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const { error } = await client.from("push_subscriptions")
        .delete()
        .eq("salon_id", salonId)
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint);
      if (error) throw error;
      await subscription.unsubscribe();
    }
    enabled = false;
  }

  button.addEventListener("click", async () => {
    if (busy || !salonId || !userId || !navigator.onLine) return;
    busy = true;
    render();
    setStatus();
    try {
      if (enabled) await disable();
      else await enable();
    } catch (error) {
      setStatus(error.message || "Push konnte nicht geändert werden.");
    } finally {
      busy = false;
      render();
    }
  });

  window.addEventListener("online", render);
  window.addEventListener("offline", render);
  if (client) client.auth.onAuthStateChange(() => setTimeout(refresh, 0));
  refresh();
})();
