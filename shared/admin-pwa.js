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

  let registration = null;
  let updateWorker = null;
  let updateNotice = null;
  let reloadForUpdate = false;

  function updateCopy() {
    const language = document.documentElement.lang.toLowerCase();
    if (language.startsWith("zh")) return { message: "新版本已准备好。", action: "更新" };
    if (language.startsWith("en")) return { message: "A new version is ready.", action: "Update" };
    return { message: "Eine neue Version ist verfügbar.", action: "Aktualisieren" };
  }

  function showUpdateNotice(worker = null) {
    updateWorker = worker || registration?.waiting || updateWorker;
    if (!updateNotice) {
      updateNotice = document.createElement("aside");
      updateNotice.className = "pwa-update-notice";
      updateNotice.setAttribute("role", "status");
      updateNotice.setAttribute("aria-live", "polite");
      updateNotice.innerHTML = '<span data-pwa-update-message></span><button type="button" data-pwa-update-action></button>';
      updateNotice.querySelector("[data-pwa-update-action]").addEventListener("click", () => {
        reloadForUpdate = true;
        const waiting = updateWorker || registration?.waiting;
        if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
        else window.location.reload();
      });
      document.body.append(updateNotice);
    }
    const copy = updateCopy();
    updateNotice.querySelector("[data-pwa-update-message]").textContent = copy.message;
    updateNotice.querySelector("[data-pwa-update-action]").textContent = copy.action;
    updateNotice.hidden = false;
  }

  window.addEventListener("openslot:backoffice-language-change", () => {
    if (updateNotice && !updateNotice.hidden) showUpdateNotice();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((nextRegistration) => {
        registration = nextRegistration;
        if (registration.waiting && navigator.serviceWorker.controller) showUpdateNotice(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) showUpdateNotice(installing);
          });
        });
      }).catch((error) => {
        console.warn("Admin offline page unavailable:", error);
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloadForUpdate) return;
      reloadForUpdate = false;
      window.location.reload();
    });
  }

  const buildId = window.OPENSLOT_SUPABASE?.buildId;
  if (!buildId) return;

  let checkingVersion = false;

  async function checkForUpdate() {
    if (checkingVersion || !navigator.onLine || document.hidden) return;
    checkingVersion = true;
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return;
      const { buildId: latestBuildId } = await response.json();
      if (latestBuildId && latestBuildId !== buildId) {
        await registration?.update();
        showUpdateNotice(registration?.waiting);
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
