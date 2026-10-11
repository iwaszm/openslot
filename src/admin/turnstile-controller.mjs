export function createTurnstileController({
  windowObject,
  widget,
  form,
  errorMessage,
  apiTimeoutMs = 10_000,
  tokenTimeoutMs = 120_000,
}) {
  let token = "";
  let waiters = [];

  const settleWaiters = (nextToken = "", error = null) => {
    const pending = waiters;
    waiters = [];
    pending.forEach((waiter) => {
      if (error) waiter.reject(error);
      else waiter.resolve(nextToken);
    });
  };

  windowObject.onOwnerTurnstileSuccess = (nextToken) => {
    token = nextToken;
    settleWaiters(nextToken);
  };
  windowObject.onOwnerTurnstileError = () => {
    token = "";
    settleWaiters("", new Error(errorMessage()));
    return true;
  };
  windowObject.onOwnerTurnstileExpired = () => { token = ""; };

  return {
    async getToken() {
      if (!widget) return "";
      const formToken = form?.querySelector('input[name="cf-turnstile-response"]')?.value || "";
      const existing = token || formToken
        || windowObject.turnstile?.getResponse?.(widget)
        || windowObject.turnstile?.getResponse?.()
        || "";
      if (existing) return existing;

      await waitForApi(windowObject, apiTimeoutMs, errorMessage);
      return new Promise((resolve, reject) => {
        let waiter;
        const timeoutId = windowObject.setTimeout(() => {
          waiters = waiters.filter((item) => item !== waiter);
          reject(new Error(errorMessage()));
        }, tokenTimeoutMs);
        waiter = {
          resolve: (value) => { windowObject.clearTimeout(timeoutId); resolve(value); },
          reject: (error) => { windowObject.clearTimeout(timeoutId); reject(error); },
        };
        waiters.push(waiter);
        try {
          windowObject.turnstile.execute(widget);
        } catch (error) {
          settleWaiters("", error);
        }
      });
    },
    clearToken() {
      token = "";
    },
    reset() {
      token = "";
      const response = form?.querySelector('input[name="cf-turnstile-response"]');
      if (response) response.value = "";
      if (widget) windowObject.turnstile?.reset?.(widget);
    },
  };
}

function waitForApi(windowObject, timeoutMs, errorMessage) {
  if (windowObject.turnstile?.execute) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = windowObject.setInterval(() => {
      if (windowObject.turnstile?.execute) {
        windowObject.clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        windowObject.clearInterval(timer);
        reject(new Error(errorMessage()));
      }
    }, 100);
  });
}
