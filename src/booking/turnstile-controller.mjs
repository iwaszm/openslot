export function createBookingTurnstileController({ form, onMissingToken, onReset, widget }) {
  function getToken({ silent = false } = {}) {
    if (!widget) return "";
    const formToken = form?.querySelector('input[name="cf-turnstile-response"]')?.value || "";
    const token = formToken || window.turnstile?.getResponse?.(widget) || window.turnstile?.getResponse?.() || "";
    if (!token && !silent) onMissingToken();
    return token;
  }
  function reset() {
    if (!widget) return;
    window.turnstile?.reset?.(widget);
    onReset();
  }
  return Object.freeze({ getToken, reset });
}
