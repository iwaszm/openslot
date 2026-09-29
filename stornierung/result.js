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
const result = RESULTS[params.get("result")] || RESULTS.error;
const salonSlug = params.get("salon") || "";
const salonLink = document.querySelector("#salonLink");
const confirmationForm = document.querySelector("#confirmationForm");
const confirmationToken = document.querySelector("#confirmationToken");

if (isConfirmation && window.OPENSLOT_SUPABASE?.url) {
  document.querySelector("#resultTitle").textContent = "Termin stornieren";
  document.querySelector("#resultMessage").textContent = "Möchten Sie diesen Termin wirklich stornieren?";
  document.title = "Termin stornieren | OpenSlot";
  confirmationForm.action = `${window.OPENSLOT_SUPABASE.url.replace(/\/$/, "")}/functions/v1/cancel-booking`;
  confirmationToken.value = token;
  confirmationForm.hidden = false;
} else {
  document.querySelector("#resultTitle").textContent = result.title;
  document.querySelector("#resultMessage").textContent = result.message;
  document.title = `${result.title} | OpenSlot`;
}

if (/^[a-z0-9-]+$/i.test(salonSlug)) {
  salonLink.href = `/${salonSlug}/`;
  salonLink.textContent = "Zurück zur Terminseite";
}
