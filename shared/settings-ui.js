import { escapeHtml } from "../src/core/html.mjs";
import {
  buildCatalogOrder,
  createCatalogDraft as createSettingsCatalogDraft,
  findServiceCategory,
  getAssignedServiceIds,
  getDefaultServiceColor,
  hasInvalidWeeklyHours,
  moveCatalogItem as moveSettingsCatalogItem,
} from "../src/settings/settings-model.mjs";
import {
  renderCatalogMarkup,
  renderDurationOptionsMarkup,
  renderHoursMarkup,
  renderOccupiedSlotsMarkup,
  renderStaffListMarkup,
} from "../src/settings/settings-view.mjs";

(function initializeSettingsUi(global) {
  "use strict";

  const repository = global.OpenSlotSettingsRepository;
  const main = document.getElementById("settingsMain");
  const denied = document.getElementById("settingsDenied");
  const toast = document.getElementById("settingsToast");
  const catalogDialog = document.getElementById("catalogEditorDialog");
  const staffDialog = document.getElementById("staffEditorDialog");
  const slug = document.body.dataset.salonSlug;
  let data;
  let readOnly = true;
  let selectedStaffId = "";
  let selectedCatalog = { type: "", id: "" };
  let catalogDraft = null;
  let toastTimer;
  const bo = global.OpenSlotBackofficeI18n;
  const t = (key, values) => bo?.t(key, values) || key;

  const errorMessage = (error) => {
    const message = String(error?.message || error || "Unbekannter Fehler").replace(/^.*?: /, "");
    if (message.includes("reorder_service_catalog") && message.includes("schema cache")) {
      return t("settings.sortUnavailable");
    }
    if (message.includes("INVALID_SERVICE_SLOTS")) return t("settings.invalidSlots");
    if (message.includes("INVALID_SERVICE")) return t("settings.invalidService");
    return message;
  };

  function showToast(message, tone = "default") {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
  }

  function setBusy(form, busy) {
    form?.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  }

  function applyReadOnlyState() {
    const badge = document.getElementById("settingsReadOnlyBadge");
    if (badge) badge.hidden = !readOnly;
    document.querySelectorAll(".owner-settings").forEach((section) => {
      section.classList.toggle("is-readonly", readOnly);
      section.querySelectorAll("input, select, textarea").forEach((control) => { control.disabled = readOnly; });
    });
  }

  function renderAccount() {
    const staff = data.staff.find((employee) => employee.id === data.account.staffId);
    document.getElementById("accountEmail").textContent = data.account.email;
    document.getElementById("accountRole").textContent = t(`settings.role${data.account.role.charAt(0).toUpperCase()}${data.account.role.slice(1)}`);
    document.getElementById("accountStaff").textContent = staff?.name || (data.account.role === "staff" ? t("settings.unassigned") : t("settings.allAreas"));
  }

  function initializeTabs() {
    const buttons = [...document.querySelectorAll("[data-settings-tab]")];
    const sections = {
      account: document.getElementById("accountSettings"),
      staff: document.getElementById("staffSettings"),
      services: document.getElementById("servicesSettings"),
      hours: document.getElementById("hoursSettings"),
      profile: document.getElementById("profileSettings"),
    };
    let activeIndex = 0;
    const activate = (index) => {
      activeIndex = Math.max(0, Math.min(buttons.length - 1, index));
      buttons.forEach((button, buttonIndex) => {
        const active = buttonIndex === activeIndex;
        button.classList.toggle("active", active);
        button.toggleAttribute("aria-current", active);
        sections[button.dataset.settingsTab].hidden = !active;
      });
      document.getElementById("settingsTabPrevious").disabled = activeIndex === 0;
      document.getElementById("settingsTabNext").disabled = activeIndex === buttons.length - 1;
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => activate(index)));
    document.getElementById("settingsTabPrevious").addEventListener("click", () => activate(activeIndex - 1));
    document.getElementById("settingsTabNext").addEventListener("click", () => activate(activeIndex + 1));
    activate(0);
  }

  function renderProfile() {
    document.getElementById("profileName").value = data.salon.name;
    document.getElementById("profileAddress").value = data.salon.address;
    document.getElementById("profilePhone").value = data.salon.phone;
    document.getElementById("profileAdminLanguage").value = data.salon.adminLanguage;
    const theme = document.querySelector(`[name="profileTheme"][value="${CSS.escape(data.salon.themePreset)}"]`);
    if (theme) theme.checked = true;
    applyProfileTheme(data.salon.themePreset);
  }

  function applyProfileTheme(preset) {
    document.documentElement.dataset.shopTheme = preset || "lime";
  }

  function renderHours() {
    document.getElementById("hoursList").innerHTML = renderHoursMarkup(data.weeklyHours, t);
    document.querySelectorAll("[data-hours-open]").forEach((control) => control.addEventListener("change", () => {
      const row = control.closest(".hours-row");
      row.classList.toggle("closed", !control.checked);
      row.querySelector(".hours-switch span").textContent = control.checked ? t("settings.open") : t("settings.closed");
    }));
    applyReadOnlyState();
  }

  function assignedServiceIds(staffId) {
    return getAssignedServiceIds(data.staffServices, staffId);
  }

  function renderStaffList() {
    document.getElementById("settingsStaffList").innerHTML = renderStaffListMarkup(data.staff, selectedStaffId, t);
  }

  function editStaff(id, { open = true } = {}) {
    const employee = data.staff.find((item) => item.id === id);
    if (!employee) return;
    selectedStaffId = employee.id;
    document.getElementById("staffKey").value = employee.id;
    document.getElementById("staffName").value = employee.name;
    document.getElementById("staffShortName").value = employee.shortName;
    document.getElementById("staffColor").value = employee.color;
    document.getElementById("staffActive").checked = employee.isActive;
    document.getElementById("staffState").textContent = employee.isActive ? t("common.active") : t("common.inactive");
    document.getElementById("staffAcceptsOnline").checked = employee.acceptsOnline;
    document.getElementById("staffOnlineState").textContent = employee.acceptsOnline ? t("common.on") : t("common.off");
    const assigned = assignedServiceIds(employee.id);
    document.getElementById("staffServiceOptions").innerHTML = data.services.map((service) => `
      <label><input type="checkbox" name="staffService" value="${escapeHtml(service.id)}" ${assigned.has(service.id) ? "checked" : ""}><span>${escapeHtml(service.shortName)}</span></label>
    `).join("");
    renderStaffList();
    applyReadOnlyState();
    if (open && staffDialog && !staffDialog.open) staffDialog.showModal();
  }

  function createCatalogDraft() {
    return createSettingsCatalogDraft(data);
  }

  function renderCatalog() {
    const draft = catalogDraft || createCatalogDraft();
    document.getElementById("settingsCatalogTree").innerHTML = renderCatalogMarkup({ data, draft, selectedCatalog, readOnly, translate: t });
  }

  function categoryForService(serviceId) {
    const draft = catalogDraft || createCatalogDraft();
    return findServiceCategory(draft, serviceId);
  }

  function defaultServiceColor(categoryId) {
    return getDefaultServiceColor(data, categoryId);
  }

  function renderOccupiedSlots(selected = []) {
    const duration = Number(document.getElementById("serviceDuration").value || 30);
    document.getElementById("occupiedSlotOptions").innerHTML = renderOccupiedSlotsMarkup(duration, selected);
    applyReadOnlyState();
  }

  function openCatalogEditor(type, id = "") {
    selectedCatalog = { type, id };
    document.getElementById("serviceSettingsForm").hidden = type !== "service";
    document.getElementById("categorySettingsForm").hidden = type !== "category";
    if (type === "service") {
      const service = data.services.find((item) => item.id === id);
      document.getElementById("serviceSettingsForm").reset();
      document.getElementById("serviceId").value = service?.id || "";
      document.getElementById("serviceEditorTitle").textContent = service ? t("settings.editService") : t("settings.newService");
      document.getElementById("serviceName").value = service?.name || "";
      document.getElementById("serviceNameEn").value = service?.nameEn || "";
      document.getElementById("serviceNameZh").value = service?.nameZh || "";
      document.getElementById("serviceShortName").value = service?.shortName || "";
      document.getElementById("serviceCategory").value = service?.categoryId || selectedCatalog.categoryId || data.categories.find((category) => category.isActive)?.id || "";
      document.getElementById("serviceColor").value = service?.color || defaultServiceColor(document.getElementById("serviceCategory").value);
      document.getElementById("serviceDuration").value = String(service?.duration || 30);
      document.getElementById("servicePrice").value = String(service?.price ?? 0);
      document.getElementById("servicePriceFrom").checked = service?.priceFrom || false;
      document.getElementById("serviceActive").checked = service?.isActive ?? true;
      document.getElementById("serviceState").textContent = service?.isActive === false ? t("common.inactive") : t("common.active");
      document.getElementById("serviceAcceptsOnline").checked = service?.acceptsOnline ?? true;
      document.getElementById("serviceOnlineState").textContent = service?.acceptsOnline === false ? t("common.off") : t("common.on");
      renderOccupiedSlots(service?.bookedSlots || [1]);
    } else {
      const category = data.categories.find((item) => item.id === id);
      document.getElementById("categorySettingsForm").reset();
      document.getElementById("categoryId").value = category?.id || "";
      document.getElementById("categoryEditorTitle").textContent = category ? t("settings.editCategory") : t("settings.newCategory");
      document.getElementById("categoryName").value = category?.name || "";
      document.getElementById("categoryNameEn").value = category?.nameEn || "";
      document.getElementById("categoryNameZh").value = category?.nameZh || "";
      document.getElementById("categoryShortName").value = category?.shortName || "";
      document.getElementById("categoryActive").checked = category?.isActive ?? true;
      document.getElementById("categoryState").textContent = category?.isActive === false ? t("common.inactive") : t("common.active");
      document.getElementById("categoryAcceptsOnline").checked = category?.acceptsOnline ?? true;
      document.getElementById("categoryOnlineState").textContent = category?.acceptsOnline === false ? t("common.off") : t("common.on");
    }
    renderCatalog();
    applyReadOnlyState();
    if (!catalogDialog.open) catalogDialog.showModal();
  }

  function moveCatalogItem(source, target) {
    if (readOnly || !target || source.id === target.dataset.itemId) return;
    catalogDraft ||= createCatalogDraft();
    const categoryId = target.dataset.dropCategory || target.closest("[data-category-id]")?.dataset.categoryId;
    catalogDraft = moveSettingsCatalogItem(catalogDraft, source, {
      type: target.dataset.dragType || "end",
      itemId: target.dataset.itemId || "",
      categoryId,
    });
    document.getElementById("saveCatalogOrder").disabled = false;
    renderCatalog();
  }

  function bindCatalogDrag() {
    const tree = document.getElementById("settingsCatalogTree");
    tree.addEventListener("dragstart", (event) => {
      const item = event.target.closest("[data-drag-type]");
      if (!item || readOnly) return;
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: item.dataset.dragType, id: item.dataset.itemId }));
    });
    tree.addEventListener("dragover", (event) => {
      if (event.target.closest("[data-drag-type], [data-drop-category]")) event.preventDefault();
    });
    tree.addEventListener("drop", (event) => {
      event.preventDefault();
      try {
        moveCatalogItem(JSON.parse(event.dataTransfer.getData("text/plain")), event.target.closest("[data-drag-type], [data-drop-category]"));
      } catch (_error) { /* Invalid external drag data is ignored. */ }
    });
  }

  async function refreshAfterWrite(message) {
    data = repository.getSettingsSnapshot();
    bo?.setLanguage(data.salon.adminLanguage);
    renderAll();
    showToast(message);
  }

  function renderAll() {
    document.title = `${data.salon.name} · ${t("settings.title")}`;
    readOnly = data.account.role === "staff";
    renderAccount();
    renderProfile();
    renderHours();
    renderStaffList();
    if (!selectedStaffId || !data.staff.some((employee) => employee.id === selectedStaffId)) selectedStaffId = data.staff[0]?.id || "";
    renderCatalog();
    applyReadOnlyState();
    bo?.translatePage();
  }

  function bindForms() {
    document.getElementById("accountPasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        setBusy(form, true);
        await repository.updatePassword(document.getElementById("newPassword").value);
        form.reset();
        showToast(t("settings.passwordChanged"));
      } catch (error) { showToast(errorMessage(error), "error"); }
      finally { setBusy(form, false); }
    });
    document.getElementById("resetPasswordForm").addEventListener("click", () => document.getElementById("accountPasswordForm").reset());

    document.getElementById("profileSettingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        setBusy(form, true);
        await repository.updateSalon({
          name: document.getElementById("profileName").value.trim(),
          address: document.getElementById("profileAddress").value.trim(),
          phone: document.getElementById("profilePhone").value.trim(),
          themePreset: document.querySelector('[name="profileTheme"]:checked')?.value,
          adminLanguage: document.getElementById("profileAdminLanguage").value,
          languages: data.salon.languages,
        });
        await refreshAfterWrite(t("settings.profileSaved"));
      } catch (error) { showToast(errorMessage(error), "error"); }
      finally { setBusy(form, false); }
    });
    document.getElementById("resetProfile").addEventListener("click", renderProfile);
    document.getElementById("profileAdminLanguage").addEventListener("change", (event) => bo?.setLanguage(event.target.value));
    document.querySelectorAll('[name="profileTheme"]').forEach((input) => input.addEventListener("change", () => applyProfileTheme(input.value)));

    document.getElementById("hoursSettingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const hours = [...document.querySelectorAll(".hours-row")].map((row) => ({
        weekday: Number(row.dataset.weekday),
        openTime: row.querySelector("[data-hours-start]").value,
        closeTime: row.querySelector("[data-hours-end]").value,
        isClosed: !row.querySelector("[data-hours-open]").checked,
      }));
      if (hasInvalidWeeklyHours(hours)) { showToast(t("settings.hoursInvalid"), "error"); return; }
      try {
        setBusy(form, true);
        await repository.updateWeeklyHours(hours);
        await refreshAfterWrite(t("settings.hoursSaved"));
      } catch (error) { showToast(errorMessage(error), "error"); }
      finally { setBusy(form, false); }
    });
    document.getElementById("resetHours").addEventListener("click", renderHours);

    document.getElementById("settingsStaffList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-staff-id]");
      if (button) editStaff(button.dataset.staffId);
    });
    document.getElementById("staffActive").addEventListener("change", (event) => { document.getElementById("staffState").textContent = event.target.checked ? t("common.active") : t("common.inactive"); });
    document.getElementById("staffAcceptsOnline").addEventListener("change", (event) => { document.getElementById("staffOnlineState").textContent = event.target.checked ? t("common.on") : t("common.off"); });
    document.getElementById("cancelStaffEdit").addEventListener("click", () => {
      if (selectedStaffId) editStaff(selectedStaffId, { open: false });
      staffDialog?.close();
    });
    document.querySelectorAll("[data-close-staff]").forEach((button) => button.addEventListener("click", () => staffDialog?.close()));
    document.getElementById("staffEditorForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const employee = data.staff.find((item) => item.id === selectedStaffId);
      const serviceIds = [...form.querySelectorAll('[name="staffService"]:checked')].map((input) => input.value);
      if (!employee) return;
      try {
        setBusy(form, true);
        await repository.updateStaff({
          ...employee,
          name: document.getElementById("staffName").value.trim(),
          shortName: document.getElementById("staffShortName").value.trim(),
          color: document.getElementById("staffColor").value,
          isActive: document.getElementById("staffActive").checked,
          acceptsOnline: document.getElementById("staffAcceptsOnline").checked,
        });
        await repository.updateStaffServices(employee.id, serviceIds);
        await refreshAfterWrite(t("settings.staffSaved"));
        staffDialog?.close();
      } catch (error) { showToast(errorMessage(error), "error"); }
      finally { setBusy(form, false); }
    });

    const duration = document.getElementById("serviceDuration");
    duration.innerHTML = renderDurationOptionsMarkup(t);
    duration.addEventListener("change", () => {
      const selected = [...document.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
      renderOccupiedSlots(selected.filter((slot) => slot <= Number(duration.value) / 30));
    });
    document.getElementById("settingsCatalogTree").addEventListener("click", (event) => {
      const item = event.target.closest("[data-edit-type]");
      if (item) openCatalogEditor(item.dataset.editType, item.dataset.itemId);
    });
    document.getElementById("addCategory").addEventListener("click", () => openCatalogEditor("category"));
    document.getElementById("addService").addEventListener("click", () => {
      const categoryId = selectedCatalog.type === "category" ? selectedCatalog.id : categoryForService(selectedCatalog.id);
      selectedCatalog = { type: "service", id: "", categoryId };
      openCatalogEditor("service");
      document.getElementById("serviceCategory").value = categoryId || data.categories.find((category) => category.isActive)?.id || "";
      document.getElementById("serviceColor").value = defaultServiceColor(document.getElementById("serviceCategory").value);
    });
    document.querySelectorAll("[data-close-catalog]").forEach((button) => button.addEventListener("click", () => catalogDialog.close()));
    document.getElementById("cancelServiceEdit").addEventListener("click", () => catalogDialog.close());
    document.getElementById("cancelCategoryEdit").addEventListener("click", () => catalogDialog.close());
    document.getElementById("serviceActive").addEventListener("change", (event) => { document.getElementById("serviceState").textContent = event.target.checked ? t("common.active") : t("common.inactive"); });
    document.getElementById("serviceAcceptsOnline").addEventListener("change", (event) => { document.getElementById("serviceOnlineState").textContent = event.target.checked ? t("common.on") : t("common.off"); });
    document.getElementById("categoryActive").addEventListener("change", (event) => { document.getElementById("categoryState").textContent = event.target.checked ? t("common.active") : t("common.inactive"); });
    document.getElementById("categoryAcceptsOnline").addEventListener("change", (event) => { document.getElementById("categoryOnlineState").textContent = event.target.checked ? t("common.on") : t("common.off"); });

    document.getElementById("serviceSettingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const existing = data.services.find((service) => service.id === document.getElementById("serviceId").value);
      const categoryId = document.getElementById("serviceCategory").value || existing?.categoryId;
      const shortNameInput = document.getElementById("serviceShortName");
      const shortName = shortNameInput.value.trim();
      const bookedSlots = [...form.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
      if (shortName.length > 12) {
        showToast(t("settings.shortNameLimit"), "error");
        shortNameInput.focus();
        return;
      }
      if (bookedSlots.length === 0) {
        showToast(t("settings.chooseOccupied"), "error");
        return;
      }
      try {
        setBusy(form, true);
        const saved = await repository.saveService({
          id: existing?.id || null,
          categoryId,
          name: document.getElementById("serviceName").value.trim(),
          nameEn: document.getElementById("serviceNameEn").value.trim(),
          nameZh: document.getElementById("serviceNameZh").value.trim(),
          shortName,
          duration: Number(duration.value),
          bookedSlots,
          price: Number(document.getElementById("servicePrice").value),
          priceFrom: document.getElementById("servicePriceFrom").checked,
          color: document.getElementById("serviceColor").value,
          isActive: document.getElementById("serviceActive").checked,
          acceptsOnline: document.getElementById("serviceAcceptsOnline").checked,
        });
        data = repository.getSettingsSnapshot();
        selectedCatalog = { type: "service", id: saved.id };
        catalogDraft = null;
        renderAll();
        catalogDialog.close();
        showToast(existing
          ? t("settings.serviceSaved")
          : t("settings.serviceSavedAssign"));
      } catch (error) { showToast(errorMessage(error), "error"); }
      finally { setBusy(form, false); }
    });
    document.getElementById("categorySettingsForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        setBusy(form, true);
        const saved = await repository.saveCategory({
          id: document.getElementById("categoryId").value || null,
          name: document.getElementById("categoryName").value.trim(),
          nameEn: document.getElementById("categoryNameEn").value.trim(),
          nameZh: document.getElementById("categoryNameZh").value.trim(),
          shortName: document.getElementById("categoryShortName").value.trim(),
          isActive: document.getElementById("categoryActive").checked,
          acceptsOnline: document.getElementById("categoryAcceptsOnline").checked,
        });
        data = repository.getSettingsSnapshot();
        selectedCatalog = { type: "category", id: saved.id };
        catalogDraft = null;
        renderAll();
        catalogDialog.close();
        showToast(t("settings.categorySaved"));
      } catch (error) { showToast(errorMessage(error), "error"); }
      finally { setBusy(form, false); }
    });

    document.getElementById("saveCatalogOrder").addEventListener("click", async (event) => {
      if (!catalogDraft) return;
      const button = event.currentTarget;
      const order = buildCatalogOrder(catalogDraft);
      try {
        button.disabled = true;
        await repository.reorderCatalog(order);
        data = repository.getSettingsSnapshot();
        catalogDraft = null;
        renderAll();
        showToast(t("settings.orderSaved"));
      } catch (error) { button.disabled = false; showToast(errorMessage(error), "error"); }
    });
    global.addEventListener("openslot:backoffice-language-change", () => {
      const selectedDuration = duration.value;
      duration.innerHTML = renderDurationOptionsMarkup(t);
      duration.value = selectedDuration;
      document.title = `${data.salon.name} · ${t("settings.title")}`;
      renderAccount();
      renderStaffList();
      renderCatalog();
    });
    bindCatalogDrag();
  }

  async function start() {
    try {
      data = await repository.initialize(slug);
      if (!data) { denied.hidden = false; return; }
      bo?.setLanguage(data.salon.adminLanguage);
      initializeTabs();
      bindForms();
      renderAll();
      main.hidden = false;
    } catch (error) {
      denied.hidden = false;
      denied.querySelector("h2").textContent = t("settings.unavailable");
      denied.querySelector("p").textContent = errorMessage(error);
    }
  }

  start();
})(window);
