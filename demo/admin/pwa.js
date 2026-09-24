(() => {
  const notice = document.querySelector("#adminOfflineNotice");
  const writeControls = [
    "#ownerLoginForm button[type='submit']",
    "#dayBlockButton",
    "#timeBlockAction",
    "[data-lane-action]",
    "[data-time-block-delete]",
    "[data-log-cancel]",
    ".confirm-dialog-submit",
  ].join(", ");

  function syncOfflineState() {
    const offline = !navigator.onLine;
    document.documentElement.classList.toggle("admin-offline", offline);
    notice.hidden = !offline;
    document.querySelectorAll(writeControls).forEach((button) => {
      button.toggleAttribute("data-offline-write", offline);
      if (offline) button.setAttribute("aria-disabled", "true");
      else button.removeAttribute("aria-disabled");
    });
  }

  document.addEventListener("click", (event) => {
    if (!navigator.onLine && event.target.closest(writeControls)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      syncOfflineState();
    }
  }, true);

  document.addEventListener("submit", (event) => {
    const confirming = event.target.closest(".confirm-dialog") && event.submitter?.value === "confirm";
    if (!navigator.onLine && (event.target.id === "ownerLoginForm" || confirming)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      syncOfflineState();
    }
  }, true);

  window.addEventListener("online", syncOfflineState);
  window.addEventListener("offline", syncOfflineState);
  new MutationObserver(syncOfflineState).observe(document.body, { childList: true, subtree: true });
  syncOfflineState();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => {
        console.warn("Admin offline page unavailable:", error);
      });
    });
  }

  const buildId = window.OPENSLOT_SUPABASE?.buildId;
  if (!buildId) return;

  let checkingVersion = false;
  let lastInteraction = Date.now();
  const markInteraction = () => { lastInteraction = Date.now(); };
  document.addEventListener("pointerdown", markInteraction, { passive: true });
  document.addEventListener("keydown", markInteraction);

  async function checkForUpdate() {
    if (checkingVersion || !navigator.onLine || document.hidden) return;
    checkingVersion = true;
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const { buildId: latestBuildId } = await response.json();
      if (latestBuildId && latestBuildId !== buildId
        && Date.now() - lastInteraction > 30_000
        && !document.querySelector(".confirm-dialog[open], .service-block-menu[open], #timeBlockPanel:not([hidden])")
        && !document.activeElement?.matches("input, select, textarea")) {
        window.location.reload();
      }
    } catch (error) {
      console.warn("Admin version check failed:", error);
    } finally {
      checkingVersion = false;
    }
  }

  window.setInterval(checkForUpdate, 60_000);
  window.addEventListener("online", checkForUpdate);
  window.addEventListener("focus", checkForUpdate);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkForUpdate();
  });
})();
