(() => {
  const runtime = window.OPENSLOT_RUNTIME;
  if (runtime?.environment !== "template" || runtime?.dataSource !== "local") {
    throw new Error("The template auth repository requires the isolated local runtime.");
  }

  const accountsKey = `${runtime.namespace}.accounts`;
  const sessionKey = `${runtime.namespace}.preview-auth`;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(`${runtime.namespace}.auth-changes`) : null;
  const defaultPassword = "demo1234";
  const defaultAccounts = [
    { id: "owner", email: "owner@openslot.test", role: "owner", staffKey: null, isActive: true },
    { id: "staff-default", email: "m1@openslot.test", role: "staff", staffKey: "default", isActive: true },
    { id: "staff-tony", email: "m2@openslot.test", role: "staff", staffKey: "tony", isActive: true },
    { id: "staff-facial", email: "m3@openslot.test", role: "staff", staffKey: "facial", isActive: true },
  ];

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const randomSalt = () => bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  async function passwordVerifier(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", data));
  }
  const publicAccount = (account) => ({
    id: account.id,
    email: account.email,
    role: account.role,
    staffKey: account.staffKey,
    isActive: account.isActive,
    sessionVersion: account.sessionVersion,
  });
  function readAccounts() {
    try {
      const accounts = JSON.parse(localStorage.getItem(accountsKey) || "[]");
      return Array.isArray(accounts) ? accounts : [];
    } catch {
      return [];
    }
  }
  async function ensureAccounts() {
    const saved = readAccounts();
    if (saved.length) {
      const retained = saved.filter((account) => !(account.id === "admin" && account.email === "admin@openslot.test"));
      const accounts = retained.map(({ displayName: _legacyDisplayName, ...account }) => account);
      const facialAccount = defaultAccounts.find((account) => account.id === "staff-facial");
      if (!accounts.some((account) => account.id === facialAccount.id)) {
        const passwordSalt = randomSalt();
        accounts.push({ ...facialAccount, sessionVersion: 1, passwordSalt, passwordVerifier: await passwordVerifier(defaultPassword, passwordSalt) });
      }
      if (JSON.stringify(accounts) !== JSON.stringify(saved)) {
        localStorage.setItem(accountsKey, JSON.stringify(accounts));
      }
      return accounts;
    }
    const accounts = await Promise.all(defaultAccounts.map(async (account) => {
      const passwordSalt = randomSalt();
      return { ...account, sessionVersion: 1, passwordSalt, passwordVerifier: await passwordVerifier(defaultPassword, passwordSalt) };
    }));
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    return accounts;
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || "null"); }
    catch { return null; }
  }
  function writeSession(account) {
    const session = publicAccount(account);
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("openslot:local-auth-change", { detail: session }));
    channel?.postMessage({ type: "session-updated", accountId: session.id });
    return clone(session);
  }
  async function listAccounts() {
    return clone((await ensureAccounts()).filter((account) => account.isActive).map(publicAccount));
  }
  async function signIn(accountId, password) {
    const account = (await ensureAccounts()).find((item) => item.id === accountId && item.isActive);
    if (!account || await passwordVerifier(password, account.passwordSalt) !== account.passwordVerifier) {
      throw new Error("Konto oder Passwort ist nicht korrekt.");
    }
    return writeSession(account);
  }
  function signOut() {
    sessionStorage.removeItem(sessionKey);
    window.dispatchEvent(new CustomEvent("openslot:local-auth-change", { detail: null }));
  }
  async function getSession() {
    const session = readSession();
    if (!session?.id) return null;
    const account = (await ensureAccounts()).find((item) => item.id === session.id && item.isActive);
    if (!account || account.sessionVersion !== session.sessionVersion) {
      signOut();
      return null;
    }
    const currentSession = publicAccount(account);
    sessionStorage.setItem(sessionKey, JSON.stringify(currentSession));
    return clone(currentSession);
  }
  async function updatePassword(currentPassword, nextPassword) {
    const session = await getSession();
    if (!session) throw new Error("Bitte erneut anmelden.");
    if (String(nextPassword).length < 8) throw new Error("Das neue Passwort muss mindestens acht Zeichen enthalten.");
    const accounts = await ensureAccounts();
    const account = accounts.find((item) => item.id === session.id);
    if (await passwordVerifier(currentPassword, account.passwordSalt) !== account.passwordVerifier) throw new Error("Das aktuelle Passwort ist nicht korrekt.");
    if (currentPassword === nextPassword) throw new Error("Das neue Passwort muss sich vom aktuellen unterscheiden.");
    account.passwordSalt = randomSalt();
    account.passwordVerifier = await passwordVerifier(nextPassword, account.passwordSalt);
    account.sessionVersion += 1;
    localStorage.setItem(accountsKey, JSON.stringify(accounts));
    return writeSession(account);
  }

  window.OpenSlotLocalAuthRepository = Object.freeze({
    defaultPassword,
    listAccounts,
    signIn,
    signOut,
    getSession,
    updatePassword,
    accountsKey,
    sessionKey,
  });
})();
