(() => {
  const repository = window.OpenSlotLocalRepository;
  const list = document.getElementById("settingsStaffList");
  const form = document.getElementById("staffEditorForm");
  const dialog = document.getElementById("staffEditorDialog");
  const message = document.getElementById("staffMessage");
  const serviceOptions = document.getElementById("staffServiceOptions");
  const showToast = (text) => window.OpenSlotSettingsToast?.(text);
  let selectedKey = "";
  const t = (key, values) => window.OpenSlotBackofficeI18n?.t(key, values) || key;
  const employees = () => repository.listStaff({ includeInactive: true });
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const onlineIcon = () => `<span class="online-status-icon" aria-label="${escapeHtml(t("common.online"))}" title="${escapeHtml(t("common.online"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>`;
  const assignedServices = (staffKey) => new Set(repository.listStaffServices().filter((item) => item.staffKey === staffKey).map((item) => item.serviceId));
  function renderServiceOptions(staffKey) {
    const selected = assignedServices(staffKey);
    serviceOptions.innerHTML = repository.listServices({ includeInactive: true }).map((service) => `<label><input type="checkbox" name="staffService" value="${escapeHtml(service.id)}" ${selected.has(service.id) ? "checked" : ""}><span>${escapeHtml(service.shortName)}</span></label>`).join("");
  }

  function renderList() {
    list.innerHTML = employees().map((employee) => `<button class="staff-list-item ${employee.staffKey === selectedKey ? "selected" : ""} ${employee.isActive ? "" : "inactive"}" type="button" data-staff-key="${escapeHtml(employee.staffKey)}"><span class="staff-initial" style="--staff-color:${escapeHtml(employee.color)}">${escapeHtml(employee.shortName.slice(0, 2))}</span><span><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.shortName)} · ${escapeHtml(t("settings.twoLanes"))}${employee.isOwner ? ` · ${escapeHtml(t("settings.ownerLabel"))}` : ""}</small></span>${employee.acceptsOnline ? onlineIcon() : ""}</button>`).join("");
  }
  function edit(key, { open = true } = {}) {
    const employee = employees().find((item) => item.staffKey === key); if (!employee) return;
    selectedKey = key;
    document.getElementById("staffKey").value = key;
    document.getElementById("staffName").value = employee.name;
    document.getElementById("staffShortName").value = employee.shortName || `M${employee.sortOrder}`;
    document.getElementById("staffColor").value = employee.color;
    document.getElementById("staffIsOwner").checked = employee.isOwner;
    document.getElementById("staffActive").checked = employee.isActive;
    document.getElementById("staffState").textContent = employee.isActive ? t("common.active") : t("common.inactive");
    document.getElementById("staffAcceptsOnline").checked = employee.acceptsOnline;
    document.getElementById("staffOnlineState").textContent = employee.acceptsOnline ? t("common.on") : t("common.off");
    document.getElementById("staffEditorTitle").textContent = t("settings.editStaff");
    message.textContent = "";
    renderServiceOptions(key);
    renderList();
    if (open && !dialog.open) dialog.showModal();
  }

  list.addEventListener("click", (event) => { const item = event.target.closest("[data-staff-key]"); if (item) edit(item.dataset.staffKey); });
  document.getElementById("cancelStaffEdit").addEventListener("click", () => { edit(selectedKey || employees()[0]?.staffKey, { open: false }); dialog.close(); });
  document.querySelectorAll("[data-close-staff]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  document.getElementById("staffActive").addEventListener("change", (event) => { document.getElementById("staffState").textContent = event.target.checked ? t("common.active") : t("common.inactive"); });
  document.getElementById("staffAcceptsOnline").addEventListener("change", (event) => { document.getElementById("staffOnlineState").textContent = event.target.checked ? t("common.on") : t("common.off"); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("staffName").value.trim();
    const current = employees().find((item) => item.staffKey === document.getElementById("staffKey").value);
    const shortName = document.getElementById("staffShortName").value.trim() || `M${current?.sortOrder || 1}`;
    if (!current || name.length < 2) { showToast(t("settings.staffRequired")); return; }
    const selectedServices = new Set([...form.querySelectorAll('[name="staffService"]:checked')].map((input) => input.value));
    try {
      const changes = repository.listServices({ includeInactive: true }).map((service) => {
        const currentStaff = repository.listStaffServices().filter((item) => item.serviceId === service.id).map((item) => item.staffKey);
        const nextStaff = selectedServices.has(service.id)
          ? [...new Set([...currentStaff, current.staffKey])]
          : currentStaff.filter((staffKey) => staffKey !== current.staffKey);
        return { service, nextStaff };
      });
      const orphaned = changes.find((change) => change.nextStaff.length === 0);
      if (orphaned) throw new Error(t("settings.staffAssignmentRequired", { service: orphaned.service.shortName }));
      const saved = repository.saveStaff({ staffKey: current.staffKey, name, shortName, color: document.getElementById("staffColor").value, isOwner: document.getElementById("staffIsOwner").checked, laneCount: 2, sortOrder: current.sortOrder, isActive: document.getElementById("staffActive").checked, acceptsOnline: document.getElementById("staffAcceptsOnline").checked });
      changes.forEach(({ service, nextStaff }) => repository.setServiceStaff(service.id, nextStaff));
      edit(saved.staffKey, { open: false });
      dialog.close();
      showToast(t("settings.itemSavedLocal", { name: saved.name }));
    } catch (error) {
      showToast(error.message);
      renderServiceOptions(current.staffKey);
      return;
    }
  });
  repository.subscribe("staff", () => { if (selectedKey && employees().some((item) => item.staffKey === selectedKey)) edit(selectedKey, { open: false }); else renderList(); });
  repository.subscribe("services", () => { if (selectedKey) renderServiceOptions(selectedKey); });
  repository.subscribe("staff-services", () => { if (selectedKey) renderServiceOptions(selectedKey); });
  window.addEventListener("openslot:backoffice-language-change", () => {
    if (selectedKey && dialog.open) edit(selectedKey, { open: false });
    else renderList();
  });
  const first = employees()[0]; if (first) { selectedKey = first.staffKey; renderList(); }
})();
