export function bindShopController({ getSalon, onLanguagePreview, onReset, onSaved, onThemePreview,
  repository, setBusy, showError, t }) {
  const form = document.getElementById("profileSettingsForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setBusy(form, true);
      await repository.updateSalon({
        name: document.getElementById("profileName").value.trim(),
        address: document.getElementById("profileAddress").value.trim(),
        phone: document.getElementById("profilePhone").value.trim(),
        themePreset: document.querySelector('[name="profileTheme"]:checked')?.value,
        adminLanguage: document.getElementById("profileAdminLanguage").value,
        languages: getSalon().languages,
      });
      await onSaved(t("settings.profileSaved"));
    } catch (error) { showError(error); }
    finally { setBusy(form, false); }
  });
  document.getElementById("resetProfile").addEventListener("click", onReset);
  document.getElementById("profileAdminLanguage").addEventListener("change", (event) => onLanguagePreview(event.target.value));
  document.querySelectorAll('[name="profileTheme"]').forEach((input) => {
    input.addEventListener("change", () => onThemePreview(input.value));
  });
}
