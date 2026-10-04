(async () => {
  const runtime = window.OPENSLOT_RUNTIME;
  const repository = window.OpenSlotLocalRepository;
  const auth = window.OpenSlotLocalAuthRepository;
  const session = await auth.getSession();
  const main = document.getElementById("settingsMain");
  const denied = document.getElementById("settingsDenied");
  if (!session || !["admin", "owner", "staff"].includes(session.role)) { denied.hidden = false; return; }
  main.hidden = false;
  const isOwner = session.role === "owner" || session.role === "admin";
  document.body.dataset.accessRole = session.role;
  const readOnlyBadge = document.getElementById("settingsReadOnlyBadge");
  if (readOnlyBadge) readOnlyBadge.hidden = isOwner;
  window.OpenSlotSettingsAccess = Object.freeze({ session, isOwner });

  const serviceForm = document.getElementById("serviceSettingsForm");
  const categoryForm = document.getElementById("categorySettingsForm");
  const tree = document.getElementById("settingsCatalogTree");
  const saveOrderButton = document.getElementById("saveCatalogOrder");
  const editorDialog = document.getElementById("catalogEditorDialog");
  const duration = document.getElementById("serviceDuration");
  const occupiedOptions = document.getElementById("occupiedSlotOptions");
  const serviceMessage = document.getElementById("serviceFormMessage");
  const categoryMessage = document.getElementById("categoryFormMessage");
  const toast = document.getElementById("settingsToast");
  let selectedType = "service";
  let selectedId = "";
  let toastTimer;
  let touchDrag = null;
  let suppressClick = false;
  let pendingDelete = null;
  let draftOrder = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const onlineIcon = () => `<span class="online-status-icon" aria-label="Online" title="Online"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>`;
  const slug = (value) => String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 36) || "item";
  const services = () => repository.listServices({ includeInactive: true });
  const categories = () => repository.listCategories({ includeInactive: true });
  const languageNames = { de: "Deutsch", en: "English", zh: "中文" };
  const translatedProperty = (language) => language === "en" ? "nameEn" : language === "zh" ? "nameZh" : "name";
  const translationLanguages = () => repository.getShopProfile().languages.slice(1, 3);
  function updateLanguageLabels() {
    const [second = "en", third = "zh"] = translationLanguages();
    document.getElementById("serviceNameSecondLabel").textContent = `Name (${languageNames[second]})`;
    document.getElementById("serviceNameThirdLabel").textContent = `Name (${languageNames[third]})`;
    document.getElementById("categoryNameSecondLabel").textContent = `Name (${languageNames[second]})`;
    document.getElementById("categoryNameThirdLabel").textContent = `Name (${languageNames[third]})`;
  }
  const showToast = (text, tone = "success") => {
    clearTimeout(toastTimer); toast.textContent = text; toast.classList.toggle("error", tone === "error"); toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  };
  window.OpenSlotSettingsToast = showToast;

  function applyReadOnlyState(root) {
    if (isOwner || !root) return;
    root.classList.add("is-readonly");
    root.setAttribute("aria-readonly", "true");
    root.querySelectorAll("input, select, textarea").forEach((control) => { control.disabled = true; });
    root.querySelectorAll("button").forEach((button) => {
      const browseControl = button.matches(".catalog-entry, .staff-list-item, .catalog-dialog-close");
      if (!browseControl) button.disabled = true;
    });
    root.querySelectorAll("[draggable]").forEach((item) => item.setAttribute("draggable", "false"));
  }
  document.querySelectorAll(".owner-settings").forEach((section) => {
    applyReadOnlyState(section);
    if (!isOwner) new MutationObserver(() => applyReadOnlyState(section)).observe(section, { childList: true, subtree: true });
  });
  if (!isOwner) {
    main.addEventListener("submit", (event) => {
      if (!event.target.closest(".owner-settings")) return;
      event.preventDefault();
      showToast("Dieser Bereich ist für Staff nur lesbar.", "error");
    }, true);
    main.addEventListener("dragstart", (event) => {
      if (event.target.closest(".owner-settings")) event.preventDefault();
    }, true);
  }

  duration.innerHTML = Array.from({ length: 16 }, (_, index) => {
    const minutes = (index + 1) * 30;
    return `<option value="${minutes}">${minutes} Min.</option>`;
  }).join("");

  function renderTree() {
    const allServices = services();
    const allCategories = categories();
    const categoryMap = new Map(allCategories.map((category) => [category.id, category]));
    const serviceMap = new Map(allServices.map((service) => [service.id, service]));
    const categoryIds = draftOrder?.categoryIds || allCategories.map((category) => category.id);
    tree.innerHTML = categoryIds.map((categoryId) => {
      const category = categoryMap.get(categoryId);
      if (!category) return "";
      const childIds = draftOrder?.serviceIdsByCategory?.[category.id] || allServices.filter((service) => service.category === category.id).map((service) => service.id);
      const children = childIds.map((id) => serviceMap.get(id)).filter(Boolean);
      return `<section class="catalog-category ${category.isActive ? "" : "inactive"}" data-category-id="${escapeHtml(category.id)}">
        <button class="catalog-entry category-entry ${selectedType === "category" && selectedId === category.id ? "selected" : ""}" type="button" draggable="true" data-drag-type="category" data-item-id="${escapeHtml(category.id)}" data-edit-type="category">
          <span class="drag-handle" aria-hidden="true">⋮⋮</span><span class="catalog-copy"><strong>${escapeHtml(category.shortName)}</strong><small>${escapeHtml(category.name)} · ${children.length} Services</small></span>${category.acceptsOnline ? onlineIcon() : ""}
        </button>
        <div class="catalog-services" data-category-services="${escapeHtml(category.id)}">
          ${children.map((service) => `<button class="catalog-entry service-entry ${service.isActive ? "" : "inactive"} ${selectedType === "service" && selectedId === service.id ? "selected" : ""}" type="button" draggable="true" data-drag-type="service" data-item-id="${escapeHtml(service.id)}" data-edit-type="service">
            <span class="drag-handle" aria-hidden="true">⋮⋮</span><span class="service-color-chip" style="--service-color:${escapeHtml(service.color || "#dfeee8")}" aria-hidden="true"></span><span class="catalog-copy"><strong>${escapeHtml(service.shortName)}</strong><small>${escapeHtml(service.name)} · ${service.duration} Min. · ${service.priceFrom ? "ab " : ""}${Number(service.price).toFixed(0)} €</small></span>${service.acceptsOnline ? onlineIcon() : ""}
          </button>`).join("")}
          <div class="catalog-drop-end" data-drop-category="${escapeHtml(category.id)}" aria-hidden="true"><span>Am Ende ablegen</span></div>
        </div>
      </section>`;
    }).join("");
  }

  function showEditor(type) {
    serviceForm.hidden = type !== "service";
    categoryForm.hidden = type !== "category";
    if (!editorDialog.open) editorDialog.showModal();
  }
  function closeEditor() { if (editorDialog.open) editorDialog.close(); }
  function setServiceCategory(selected) {
    document.getElementById("serviceCategory").value = categories().some((category) => category.id === selected) ? selected : "";
  }
  function renderOccupiedSlots(selected = []) {
    const count = Number(duration.value) / 30;
    occupiedOptions.innerHTML = Array.from({ length: count }, (_, index) => {
      const slot = index + 1;
      return `<label><input type="checkbox" name="occupiedSlot" value="${slot}" ${selected.includes(slot) ? "checked" : ""}><span>${slot}</span></label>`;
    }).join("");
  }
  function editService(id) {
    const service = services().find((item) => item.id === id); if (!service) return;
    selectedType = "service"; selectedId = service.id; showEditor("service");
    document.getElementById("serviceEditorTitle").textContent = "Service bearbeiten";
    document.getElementById("serviceId").value = service.id;
    const [first, second, third] = repository.getShopProfile().languages;
    document.getElementById("serviceName").value = service[translatedProperty(first)] || service.name;
    document.getElementById("serviceNameEn").value = service[translatedProperty(second)] || "";
    document.getElementById("serviceNameZh").value = service[translatedProperty(third)] || "";
    document.getElementById("serviceShortName").value = service.shortName || service.name.slice(0, 12);
    setServiceCategory(service.category); duration.value = String(service.duration);
    document.getElementById("servicePrice").value = String(service.price);
    document.getElementById("servicePriceFrom").checked = service.priceFrom;
    document.getElementById("serviceColor").value = service.color || "#dfeee8";
    document.getElementById("serviceActive").checked = service.isActive;
    document.getElementById("serviceState").textContent = service.isActive ? "Aktiv" : "Inaktiv";
    document.getElementById("serviceAcceptsOnline").checked = service.acceptsOnline;
    document.getElementById("serviceOnlineState").textContent = service.acceptsOnline ? "An" : "Aus";
    document.getElementById("deleteService").hidden = !repository.canDeleteService(service.id);
    serviceMessage.textContent = ""; renderOccupiedSlots(service.bookedSlots); renderTree();
  }
  function editCategory(id) {
    const category = categories().find((item) => item.id === id); if (!category) return;
    selectedType = "category"; selectedId = category.id; showEditor("category");
    document.getElementById("categoryEditorTitle").textContent = "Kategorie bearbeiten";
    document.getElementById("categoryId").value = category.id;
    const [first, second, third] = repository.getShopProfile().languages;
    document.getElementById("categoryName").value = category[translatedProperty(first)] || category.name;
    document.getElementById("categoryShortName").value = category.shortName || category.name.slice(0, 12);
    document.getElementById("categoryNameEn").value = category[translatedProperty(second)] || "";
    document.getElementById("categoryNameZh").value = category[translatedProperty(third)] || "";
    document.getElementById("categorySortOrder").value = String(category.sortOrder);
    document.getElementById("categoryActive").checked = category.isActive;
    document.getElementById("categoryState").textContent = category.isActive ? "Aktiv" : "Inaktiv";
    document.getElementById("categoryAcceptsOnline").checked = category.acceptsOnline;
    document.getElementById("categoryOnlineState").textContent = category.acceptsOnline ? "An" : "Aus";
    document.getElementById("deleteCategory").hidden = !repository.canDeleteCategory(category.id);
    categoryMessage.textContent = ""; renderTree();
  }
  function newService() {
    const previousService = selectedType === "service" ? services().find((item) => item.id === selectedId) : null;
    const targetCategory = selectedType === "category" ? selectedId : previousService?.category;
    selectedType = "service"; selectedId = ""; showEditor("service"); serviceForm.reset();
    document.getElementById("serviceId").value = ""; document.getElementById("serviceEditorTitle").textContent = "Neuer Service";
    const category = targetCategory || categories().find((item) => item.isActive)?.id;
    duration.value = "30"; setServiceCategory(category);
    document.getElementById("serviceColor").value = services().find((service) => service.category === category)?.color || "#dfeee8";
    document.getElementById("serviceActive").checked = true; document.getElementById("serviceState").textContent = "Aktiv";
    document.getElementById("serviceAcceptsOnline").checked = true; document.getElementById("serviceOnlineState").textContent = "An";
    document.getElementById("deleteService").hidden = true;
    renderOccupiedSlots([1]); renderTree(); document.getElementById("serviceName").focus();
  }
  function newCategory() {
    selectedType = "category"; selectedId = ""; showEditor("category"); categoryForm.reset();
    document.getElementById("categoryId").value = ""; document.getElementById("categoryEditorTitle").textContent = "Neue Kategorie";
    document.getElementById("categorySortOrder").value = String(categories().length + 1);
    document.getElementById("categoryActive").checked = true; document.getElementById("categoryState").textContent = "Aktiv";
    document.getElementById("categoryAcceptsOnline").checked = true; document.getElementById("categoryOnlineState").textContent = "An";
    document.getElementById("deleteCategory").hidden = true;
    renderTree(); document.getElementById("categoryName").focus();
  }

  function persistMove(sourceType, sourceId, target) {
    if (!target || sourceId === target.dataset.itemId) return;
    const categoryIds = [...(draftOrder?.categoryIds || categories().map((category) => category.id))];
    const serviceIdsByCategory = Object.fromEntries(categoryIds.map((id) => [id, [...(draftOrder?.serviceIdsByCategory?.[id] || services().filter((service) => service.category === id).map((service) => service.id))]]));
    if (sourceType === "category") {
      if (target.dataset.dragType !== "category") return;
      const from = categoryIds.indexOf(sourceId); const to = categoryIds.indexOf(target.dataset.itemId); if (from < 0 || to < 0) return;
      categoryIds.splice(from, 1); categoryIds.splice(to, 0, sourceId);
    } else {
      Object.values(serviceIdsByCategory).forEach((ids) => { const index = ids.indexOf(sourceId); if (index >= 0) ids.splice(index, 1); });
      const targetCategory = target.dataset.dropCategory || (target.dataset.dragType === "category" ? target.dataset.itemId : target.closest("[data-category-id]")?.dataset.categoryId);
      if (!targetCategory || !serviceIdsByCategory[targetCategory]) return;
      const targetIndex = target.dataset.dragType === "service" ? serviceIdsByCategory[targetCategory].indexOf(target.dataset.itemId) : serviceIdsByCategory[targetCategory].length;
      serviceIdsByCategory[targetCategory].splice(targetIndex < 0 ? serviceIdsByCategory[targetCategory].length : targetIndex, 0, sourceId);
    }
    draftOrder = { categoryIds, serviceIdsByCategory };
    saveOrderButton.disabled = false;
    renderTree();
  }
  const clearDropTargets = () => tree.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));

  tree.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; event.preventDefault(); return; }
    const item = event.target.closest("[data-edit-type]"); if (!item) return;
    if (item.dataset.editType === "category") editCategory(item.dataset.itemId); else editService(item.dataset.itemId);
  });
  tree.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-drag-type]"); if (!item) return;
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", JSON.stringify({ type: item.dataset.dragType, id: item.dataset.itemId })); item.classList.add("dragging"); tree.classList.toggle("dragging-service", item.dataset.dragType === "service");
  });
  tree.addEventListener("dragover", (event) => { const target = event.target.closest("[data-drag-type], [data-drop-category]"); if (!target) return; event.preventDefault(); clearDropTargets(); target.classList.add("drop-target"); });
  tree.addEventListener("drop", (event) => {
    event.preventDefault(); const target = event.target.closest("[data-drag-type], [data-drop-category]");
    try { const source = JSON.parse(event.dataTransfer.getData("text/plain")); persistMove(source.type, source.id, target); } catch (_error) { /* ignored */ }
    clearDropTargets();
  });
  tree.addEventListener("dragend", () => { clearDropTargets(); tree.classList.remove("dragging-service"); tree.querySelectorAll(".dragging").forEach((item) => item.classList.remove("dragging")); });
  tree.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    const item = event.target.closest("[data-drag-type]"); if (!item) return;
    const pending = { pending: true, startX: event.clientX, startY: event.clientY };
    pending.timer = setTimeout(() => { touchDrag = { type: item.dataset.dragType, id: item.dataset.itemId, item }; item.classList.add("dragging"); tree.classList.toggle("dragging-service", item.dataset.dragType === "service"); navigator.vibrate?.(20); }, 400);
    touchDrag = pending;
  });
  tree.addEventListener("pointermove", (event) => {
    if (!touchDrag) return;
    if (touchDrag.pending) { if (Math.hypot(event.clientX - touchDrag.startX, event.clientY - touchDrag.startY) > 8) { clearTimeout(touchDrag.timer); touchDrag = null; } return; }
    event.preventDefault(); clearDropTargets(); document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-drag-type], [data-drop-category]")?.classList.add("drop-target");
  }, { passive: false });
  const finishTouchDrag = (event) => {
    if (!touchDrag) return;
    if (touchDrag.pending) { clearTimeout(touchDrag.timer); touchDrag = null; return; }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-drag-type], [data-drop-category]");
    persistMove(touchDrag.type, touchDrag.id, target); touchDrag.item.classList.remove("dragging"); tree.classList.remove("dragging-service"); clearDropTargets(); touchDrag = null; suppressClick = true;
  };
  tree.addEventListener("pointerup", finishTouchDrag); tree.addEventListener("pointercancel", finishTouchDrag);

  document.getElementById("addService").addEventListener("click", newService);
  document.getElementById("addCategory").addEventListener("click", newCategory);
  saveOrderButton.addEventListener("click", () => {
    if (!draftOrder) return;
    repository.reorderCatalog(draftOrder);
    draftOrder = null;
    saveOrderButton.disabled = true;
    renderTree();
    showToast("Reihenfolge wurde lokal gespeichert.");
  });
  document.querySelectorAll("[data-close-catalog]").forEach((button) => button.addEventListener("click", closeEditor));
  document.getElementById("cancelServiceEdit").addEventListener("click", () => { closeEditor(); showToast("Nicht gespeicherte Änderungen wurden verworfen."); });
  document.getElementById("cancelCategoryEdit").addEventListener("click", () => { closeEditor(); showToast("Nicht gespeicherte Änderungen wurden verworfen."); });
  duration.addEventListener("change", () => {
    const checked = [...serviceForm.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
    renderOccupiedSlots(checked.filter((slot) => slot <= Number(duration.value) / 30));
  });
  document.getElementById("serviceActive").addEventListener("change", (event) => { document.getElementById("serviceState").textContent = event.target.checked ? "Aktiv" : "Inaktiv"; });
  document.getElementById("serviceAcceptsOnline").addEventListener("change", (event) => { document.getElementById("serviceOnlineState").textContent = event.target.checked ? "An" : "Aus"; });
  document.getElementById("categoryActive").addEventListener("change", (event) => { document.getElementById("categoryState").textContent = event.target.checked ? "Aktiv" : "Inaktiv"; });
  document.getElementById("categoryAcceptsOnline").addEventListener("change", (event) => { document.getElementById("categoryOnlineState").textContent = event.target.checked ? "An" : "Aus"; });

  function requestDelete(type) {
    const item = type === "service" ? services().find((entry) => entry.id === selectedId) : categories().find((entry) => entry.id === selectedId);
    if (!item) return;
    pendingDelete = { type, id: item.id };
    document.getElementById("deleteDialogTitle").textContent = type === "service" ? "Service löschen?" : "Kategorie löschen?";
    document.getElementById("deleteDialogText").textContent = `„${item.name}“ wird dauerhaft aus den lokalen Testdaten entfernt.`;
    document.getElementById("deleteDialog").showModal();
  }
  document.getElementById("deleteService").addEventListener("click", () => requestDelete("service"));
  document.getElementById("deleteCategory").addEventListener("click", () => requestDelete("category"));
  document.getElementById("deleteDialog").addEventListener("close", (event) => {
    if (event.target.returnValue !== "confirm" || !pendingDelete) { pendingDelete = null; return; }
    const deletedType = pendingDelete.type;
    try {
      if (deletedType === "service") repository.deleteService(pendingDelete.id);
      else repository.deleteCategory(pendingDelete.id);
      pendingDelete = null;
      closeEditor(); selectedId = ""; renderTree();
      showToast(deletedType === "service" ? "Service wurde gelöscht." : "Kategorie wurde gelöscht.");
    } catch (error) { pendingDelete = null; showToast(error.message); }
  });

  serviceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("serviceName").value.trim(); const shortName = document.getElementById("serviceShortName").value.trim();
    const bookedSlots = [...serviceForm.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
    if (name.length < 2 || !shortName || !bookedSlots.length) { showToast("Name, Kurzname (back-end) und belegte Zeit sind erforderlich."); return; }
    let id = document.getElementById("serviceId").value;
    if (!id) { const used = new Set(services().map((item) => item.id)); const base = `template_${slug(name)}`; id = base; let suffix = 2; while (used.has(id)) id = `${base}_${suffix++}`; }
    const category = document.getElementById("serviceCategory").value; const existing = services().find((item) => item.id === id);
    const names = { name: existing?.name || name, nameEn: existing?.nameEn || "", nameZh: existing?.nameZh || "" };
    const [first, second, third] = repository.getShopProfile().languages;
    names[translatedProperty(first)] = name;
    names[translatedProperty(second)] = document.getElementById("serviceNameEn").value.trim();
    names[translatedProperty(third)] = document.getElementById("serviceNameZh").value.trim();
    if (!names.name) names.name = name;
    const saved = repository.saveService({ id, ...names, shortName, color: document.getElementById("serviceColor").value, category, sortOrder: existing?.sortOrder || services().filter((item) => item.category === category).length + 1, gender: "unisex", duration: Number(duration.value), bookedSlots, price: Number(document.getElementById("servicePrice").value), priceFrom: document.getElementById("servicePriceFrom").checked, isActive: document.getElementById("serviceActive").checked, acceptsOnline: document.getElementById("serviceAcceptsOnline").checked });
    selectedType = "service"; selectedId = saved.id; renderTree(); closeEditor(); showToast(`${saved.name} wurde lokal gespeichert.`);
  });
  categoryForm.addEventListener("submit", (event) => {
    event.preventDefault(); const name = document.getElementById("categoryName").value.trim(); const shortName = document.getElementById("categoryShortName").value.trim();
    if (name.length < 2 || !shortName) { showToast("Name und Kurzname (back-end) sind erforderlich."); return; }
    let id = document.getElementById("categoryId").value;
    if (!id) { const used = new Set(categories().map((item) => item.id)); const base = `template_${slug(name)}`; id = base; let suffix = 2; while (used.has(id)) id = `${base}_${suffix++}`; }
    const existing = categories().find((item) => item.id === id);
    const names = { name: existing?.name || name, nameEn: existing?.nameEn || "", nameZh: existing?.nameZh || "" };
    const [first, second, third] = repository.getShopProfile().languages;
    names[translatedProperty(first)] = name;
    names[translatedProperty(second)] = document.getElementById("categoryNameEn").value.trim();
    names[translatedProperty(third)] = document.getElementById("categoryNameZh").value.trim();
    if (!names.name) names.name = name;
    const saved = repository.saveCategory({ id, ...names, shortName, sortOrder: Number(document.getElementById("categorySortOrder").value), isActive: document.getElementById("categoryActive").checked, acceptsOnline: document.getElementById("categoryAcceptsOnline").checked });
    selectedType = "category"; selectedId = saved.id; renderTree(); closeEditor(); showToast(`${saved.name} wurde lokal gespeichert.`);
  });

  repository.subscribe("services", () => {
    if (editorDialog.open && selectedType === "service" && selectedId && services().some((item) => item.id === selectedId)) editService(selectedId);
    else renderTree();
  });
  repository.subscribe("categories", () => {
    if (editorDialog.open && selectedType === "category" && selectedId && categories().some((item) => item.id === selectedId)) editCategory(selectedId);
    else {
      renderTree();
      if (selectedType === "service" && selectedId) setServiceCategory(services().find((item) => item.id === selectedId)?.category);
    }
  });
  repository.subscribe("shop-profile", () => {
    updateLanguageLabels();
    if (editorDialog.open && selectedType === "service" && selectedId) editService(selectedId);
    if (editorDialog.open && selectedType === "category" && selectedId) editCategory(selectedId);
  });
  updateLanguageLabels();
  renderTree();
})();
