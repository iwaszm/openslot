(() => {
  const auth = window.OpenSlotLocalAuthRepository;
  const passwordForm = document.getElementById("accountPasswordForm");
  const showToast = (text, tone) => window.OpenSlotSettingsToast?.(text, tone);

  async function render() {
    const session = await auth.getSession();
    if (!session) { window.location.replace("./admin.html"); return; }
    document.getElementById("accountEmail").textContent = session.email;
    document.getElementById("accountRole").textContent = session.role === "admin" ? "Admin" : session.role === "owner" ? "Owner" : "Staff";
    const staff = window.OpenSlotLocalRepository.listStaff({ includeInactive: true }).find((item) => session.staffKey ? item.staffKey === session.staffKey : session.role === "owner" && item.isOwner);
    document.getElementById("accountStaff").textContent = staff?.name || (session.role === "owner" ? "Alle Bereiche" : "Nicht zugeordnet");
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById("currentPassword").value;
    const nextPassword = document.getElementById("newPassword").value;
    if (nextPassword !== document.getElementById("confirmPassword").value) { showToast("Die neuen Passwörter stimmen nicht überein.", "error"); return; }
    try {
      await auth.updatePassword(currentPassword, nextPassword);
      passwordForm.reset();
      showToast("Passwort wurde geändert. Die lokale Sitzung wurde erneuert.");
    } catch (error) { showToast(error.message, "error"); }
  });
  document.getElementById("resetPasswordForm").addEventListener("click", () => { passwordForm.reset(); showToast("Passworteingaben wurden geleert."); });
  render();
})();
