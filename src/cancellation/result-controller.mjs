const RESULTS = {
  cancelled: {
    title: "Termin storniert",
    message: "Ihre Stornierung wurde gespeichert. Der Termin ist nicht mehr reserviert.",
  },
  "already-cancelled": {
    title: "Termin bereits storniert",
    message: "Dieser Termin wurde bereits storniert und ist nicht mehr reserviert.",
  },
  invalid: {
    title: "Ungültiger Link",
    message: "Der Stornierungslink ist ungültig oder unvollständig.",
  },
  "not-found": {
    title: "Termin nicht gefunden",
    message: "Dieser Termin wurde nicht gefunden oder der Link ist abgelaufen.",
  },
  error: {
    title: "Stornierung fehlgeschlagen",
    message: "Die Stornierung konnte nicht verarbeitet werden. Bitte kontaktieren Sie den Salon.",
  },
};

const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";
const isConfirmation = params.get("confirm") === "1" && /^[0-9a-f]{48}$/i.test(token);
const resultKey = RESULTS[params.get("result")] ? params.get("result") : "error";
const result = RESULTS[resultKey];
const salonSlug = /^[a-z0-9-]+$/i.test(params.get("salon") || "") ? params.get("salon") : "";
const salonLink = document.querySelector("#salonLink");
const salonName = document.querySelector("#salonName");
const confirmationForm = document.querySelector("#confirmationForm");
const confirmationToken = document.querySelector("#confirmationToken");

document.body.dataset.state = isConfirmation ? "confirmation" : resultKey;

if (isConfirmation && window.OPENSLOT_SUPABASE?.url) {
  setResult("Termin stornieren", "Möchten Sie diesen Termin wirklich stornieren?");
  document.title = "Termin stornieren | OpenSlot";
  confirmationForm.action = `${window.OPENSLOT_SUPABASE.url.replace(/\/$/, "")}/functions/v1/cancel-booking`;
  confirmationToken.value = token;
  confirmationForm.hidden = false;
} else {
  setResult(result.title, result.message);
  document.title = `${result.title} | OpenSlot`;
}

if (salonSlug) {
  salonLink.href = `/${salonSlug}/`;
  salonLink.textContent = "Zurück zur Terminseite";
  void applySalonAppearance(salonSlug);
}

function setResult(title, message) {
  document.querySelector("#resultTitle").textContent = title;
  document.querySelector("#resultMessage").textContent = message;
}

async function applySalonAppearance(slug) {
  const config = window.OPENSLOT_SUPABASE || {};
  if (!config.url || !config.anonKey) return;
  try {
    const endpoint = new URL(`${config.url.replace(/\/$/, "")}/rest/v1/salons`);
    endpoint.searchParams.set("slug", `eq.${slug}`);
    endpoint.searchParams.set("select", "name,theme_preset");
    endpoint.searchParams.set("limit", "1");
    const response = await fetch(endpoint, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
    });
    if (!response.ok) return;
    const [salon] = await response.json();
    if (!salon) return;
    if (salon.name) salonName.textContent = salon.name;
    if (["lime", "pink", "glacier", "gray"].includes(salon.theme_preset)) {
      document.documentElement.dataset.shopTheme = salon.theme_preset;
    }
  } catch (_error) {
    // Cancellation remains usable when optional salon presentation data is unavailable.
  }
}
