export function bindStaffController({ dialog, getData, getSelectedStaffId, onEdit, onSaved,
  repository, setBusy, showError, t }) {
  document.getElementById("settingsStaffList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-staff-id]");
    if (button) onEdit(button.dataset.staffId);
  });
  const bindState = (controlId, stateId, onKey, offKey) => document.getElementById(controlId).addEventListener("change", (event) => {
    document.getElementById(stateId).textContent = t(event.target.checked ? onKey : offKey);
  });
  bindState("staffActive", "staffState", "common.active", "common.inactive");
  bindState("staffAcceptsOnline", "staffOnlineState", "common.on", "common.off");
  document.getElementById("cancelStaffEdit").addEventListener("click", () => dialog?.close());
  document.querySelectorAll("[data-close-staff]").forEach((button) => button.addEventListener("click", () => dialog?.close()));

  const form = document.getElementById("staffEditorForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const employee = getData().staff.find((item) => item.id === getSelectedStaffId());
    if (!employee) return;
    const serviceIds = [...form.querySelectorAll('[name="staffService"]:checked')].map((input) => input.value);
    try {
      setBusy(form, true);
      await repository.updateStaff({ ...employee, name: document.getElementById("staffName").value.trim(),
        shortName: document.getElementById("staffShortName").value.trim(), color: document.getElementById("staffColor").value,
        isActive: document.getElementById("staffActive").checked,
        acceptsOnline: document.getElementById("staffAcceptsOnline").checked });
      await repository.updateStaffServices(employee.id, serviceIds);
      await onSaved(t("settings.staffSaved"));
      dialog?.close();
    } catch (error) { showError(error); }
    finally { setBusy(form, false); }
  });
}
