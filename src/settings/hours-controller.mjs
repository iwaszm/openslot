export function bindHoursController({ isInvalid, onReset, onSaved, repository, setBusy, showError, showMessage, t }) {
  const form = document.getElementById("hoursSettingsForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const hours = [...document.querySelectorAll(".hours-row")].map((row) => ({
      weekday: Number(row.dataset.weekday),
      openTime: row.querySelector("[data-hours-start]").value,
      closeTime: row.querySelector("[data-hours-end]").value,
      isClosed: !row.querySelector("[data-hours-open]").checked,
    }));
    if (isInvalid(hours)) { showMessage(t("settings.hoursInvalid"), "error"); return; }
    try {
      setBusy(form, true);
      await repository.updateWeeklyHours(hours);
      await onSaved(t("settings.hoursSaved"));
    } catch (error) { showError(error); }
    finally { setBusy(form, false); }
  });
  document.getElementById("resetHours").addEventListener("click", onReset);
}
