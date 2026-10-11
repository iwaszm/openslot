export function bindAccountController({ repository, setBusy, showError, showSuccess, t }) {
  const form = document.getElementById("accountPasswordForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setBusy(form, true);
      await repository.updatePassword(document.getElementById("newPassword").value);
      form.reset();
      showSuccess(t("settings.passwordChanged"));
    } catch (error) { showError(error); }
    finally { setBusy(form, false); }
  });
  document.getElementById("resetPasswordForm").addEventListener("click", () => form.reset());
}
