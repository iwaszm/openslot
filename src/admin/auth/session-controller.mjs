export function createAdminSessionController({ elements, repository, security, state, t, onAccessChanged, renderAuthState }) {
  let loginPending = false;
  let currentUserId = null;

  async function applyUser(user) {
    currentUserId = user?.id || null;
    state.isOwner = false;
    state.accessRole = null;
    state.accessStaffId = null;
    state.staffViewIdentity = null;
    if (!user) { renderAuthState(null); return; }
    try {
      const access = await repository.getSalonAccess(user.id);
      state.isOwner = access.allowed;
      state.accessRole = access.role;
      state.accessStaffId = access.staffId || null;
      renderAuthState(user, access.allowed ? "" : t("admin.settingsAccessDenied"));
    } catch (error) {
      renderAuthState(user, t("admin.settingsCheckFailed", { message: error.message }));
    }
  }

  async function initialize() {
    if (!repository.authSupported) { renderAuthState({ email: "local-demo" }); return; }
    await applyUser(await repository.getCurrentUser());
    repository.onAuthChange(async (user) => {
      if ((user?.id || null) === currentUserId) return;
      await applyUser(user);
      await onAccessChanged();
    });
  }

  async function login(event) {
    event.preventDefault();
    if (loginPending) return;
    const submit = elements.form?.querySelector('[type="submit"]');
    loginPending = true;
    if (submit) submit.disabled = true;
    try {
      if (elements.message) elements.message.textContent = t("admin.verifying");
      const token = await security.getToken();
      await repository.signIn(elements.email.value.trim(), elements.password.value, token);
      elements.password.value = "";
      security.clearToken();
    } catch (error) {
      if (elements.message) elements.message.textContent = t("admin.loginFailed", { message: error.message });
      security.reset();
    } finally {
      loginPending = false;
      if (submit) submit.disabled = false;
    }
  }

  async function logout() {
    await repository.signOut();
    security.reset();
  }

  function bind() {
    elements.form?.addEventListener("submit", login);
    elements.logout?.addEventListener("click", logout);
  }

  return Object.freeze({ bind, initialize });
}
