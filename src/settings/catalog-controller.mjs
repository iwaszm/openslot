export function bindCatalogController({ buildOrder, dialog, getCatalogDraft, getData, onCategorySaved,
  onOrderSaved, onServiceSaved, repository, setBusy, showError, showMessage, t }) {
  const bindState = (controlId, stateId, onKey, offKey) => document.getElementById(controlId).addEventListener("change", (event) => {
    document.getElementById(stateId).textContent = t(event.target.checked ? onKey : offKey);
  });
  bindState("serviceActive", "serviceState", "common.active", "common.inactive");
  bindState("serviceAcceptsOnline", "serviceOnlineState", "common.on", "common.off");
  bindState("categoryActive", "categoryState", "common.active", "common.inactive");
  bindState("categoryAcceptsOnline", "categoryOnlineState", "common.on", "common.off");

  const serviceForm = document.getElementById("serviceSettingsForm");
  serviceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const existing = getData().services.find((item) => item.id === document.getElementById("serviceId").value);
    const shortNameInput = document.getElementById("serviceShortName");
    const shortName = shortNameInput.value.trim();
    const bookedSlots = [...serviceForm.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
    if (shortName.length > 12) { showMessage(t("settings.shortNameLimit"), "error"); shortNameInput.focus(); return; }
    if (bookedSlots.length === 0) { showMessage(t("settings.chooseOccupied"), "error"); return; }
    try {
      setBusy(serviceForm, true);
      const saved = await repository.saveService({ id: existing?.id || null,
        categoryId: document.getElementById("serviceCategory").value || existing?.categoryId,
        name: document.getElementById("serviceName").value.trim(), nameEn: document.getElementById("serviceNameEn").value.trim(),
        nameZh: document.getElementById("serviceNameZh").value.trim(), shortName,
        duration: Number(document.getElementById("serviceDuration").value), bookedSlots,
        price: Number(document.getElementById("servicePrice").value), priceFrom: document.getElementById("servicePriceFrom").checked,
        color: document.getElementById("serviceColor").value, isActive: document.getElementById("serviceActive").checked,
        acceptsOnline: document.getElementById("serviceAcceptsOnline").checked });
      await onServiceSaved(saved, Boolean(existing));
      dialog.close();
    } catch (error) { showError(error); }
    finally { setBusy(serviceForm, false); }
  });

  const categoryForm = document.getElementById("categorySettingsForm");
  categoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setBusy(categoryForm, true);
      const saved = await repository.saveCategory({ id: document.getElementById("categoryId").value || null,
        name: document.getElementById("categoryName").value.trim(), nameEn: document.getElementById("categoryNameEn").value.trim(),
        nameZh: document.getElementById("categoryNameZh").value.trim(), shortName: document.getElementById("categoryShortName").value.trim(),
        isActive: document.getElementById("categoryActive").checked,
        acceptsOnline: document.getElementById("categoryAcceptsOnline").checked });
      await onCategorySaved(saved);
      dialog.close();
    } catch (error) { showError(error); }
    finally { setBusy(categoryForm, false); }
  });

  document.getElementById("saveCatalogOrder").addEventListener("click", async (event) => {
    const draft = getCatalogDraft();
    if (!draft) return;
    try {
      event.currentTarget.disabled = true;
      await repository.reorderCatalog(buildOrder(draft));
      await onOrderSaved();
    } catch (error) { event.currentTarget.disabled = false; showError(error); }
  });
}
