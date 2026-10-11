export function createLiveRefreshController({
  intervalMs,
  isEnabled,
  refresh,
  onFailure,
}) {
  let inFlight = false;
  let intervalId = null;

  async function run() {
    if (inFlight || document.hidden || !navigator.onLine || !isEnabled()) return;
    inFlight = true;
    try {
      await refresh();
    } catch (error) {
      onFailure(error);
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (intervalId !== null) return;
    intervalId = window.setInterval(run, intervalMs);
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function handleVisibilityChange() {
    if (!document.hidden) run();
  }

  return Object.freeze({ run, start });
}
