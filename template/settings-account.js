(() => {
  const auth = window.OpenSlotLocalAuthRepository;
  const passwordForm = document.getElementById("accountPasswordForm");
  const showToast = (text, tone) => window.OpenSlotSettingsToast?.(text, tone);
  const t = (key, values) => window.OpenSlotBackofficeI18n?.t(key, values) || key;

  async function render() {
    const session = await auth.getSession();
    if (!session) { window.location.replace("./admin.html"); return; }
    document.getElementById("accountEmail").textContent = session.email;
    document.getElementById("accountRole").textContent = t(`settings.role${session.role.charAt(0).toUpperCase()}${session.role.slice(1)}`);
    const staff = window.OpenSlotLocalRepository.listStaff({ includeInactive: true }).find((item) => session.staffKey ? item.staffKey === session.staffKey : session.role === "owner" && item.isOwner);
    document.getElementById("accountStaff").textContent = staff?.name || (session.role === "owner" ? t("settings.allAreas") : t("settings.unassigned"));
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById("currentPassword").value;
    const nextPassword = document.getElementById("newPassword").value;
    if (nextPassword !== document.getElementById("confirmPassword").value) { showToast(t("settings.passwordMismatch"), "error"); return; }
    try {
      await auth.updatePassword(currentPassword, nextPassword);
      passwordForm.reset();
      showToast(t("settings.passwordChangedLocal"));
    } catch (error) { showToast(error.message, "error"); }
  });
  document.getElementById("resetPasswordForm").addEventListener("click", () => { passwordForm.reset(); showToast(t("settings.passwordCleared")); });
  window.addEventListener("openslot:backoffice-language-change", render);
  render();
})();
