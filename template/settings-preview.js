(() => {
  const runtime = window.OPENSLOT_RUNTIME;
  const repository = window.OpenSlotLocalRepository;
  const authKey = `${runtime.namespace}.preview-auth`;
  const session = (() => { try { return JSON.parse(sessionStorage.getItem(authKey) || "null"); } catch { return null; } })();
  const main = document.getElementById("settingsMain");
  const denied = document.getElementById("settingsDenied");
  if (session?.role !== "owner") {
    denied.hidden = false;
    return;
  }
  main.hidden = false;

  const form = document.getElementById("serviceSettingsForm");
  const list = document.getElementById("settingsServiceList");
  const duration = document.getElementById("serviceDuration");
  const occupiedOptions = document.getElementById("occupiedSlotOptions");
  const staffOptions = document.getElementById("serviceStaffOptions");
  const message = document.getElementById("serviceFormMessage");
  const toast = document.getElementById("settingsToast");
  const categoryForm = document.getElementById("categorySettingsForm");
  const categoryList = document.getElementById("settingsCategoryList");
  const categoryMessage = document.getElementById("categoryFormMessage");
  let selectedId = "";
  let selectedCategoryId = "";
  let toastTimer;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const slug = (value) => String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 36) || "service";
  const showToast = (text) => {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  };
  const services = () => repository.listServices({ includeInactive: true });
  const categories = () => repository.listCategories({ includeInactive: true });
  const categoryName = (id) => categories().find((category) => category.id === id)?.name || id;
  const staff = repository.listStaff();
  const assignedStaff = (serviceId) => new Set(repository.listStaffServices()
    .filter((item) => item.serviceId === serviceId).map((item) => item.staffKey));

  duration.innerHTML = Array.from({ length: 16 }, (_, index) => {
    const minutes = (index + 1) * 30;
    return `<option value="${minutes}">${minutes} Min.</option>`;
  }).join("");

  function renderList() {
    list.innerHTML = services().map((service) => `
      <button class="settings-service-item ${service.id === selectedId ? "selected" : ""} ${service.isActive ? "" : "inactive"}" type="button" data-service-id="${escapeHtml(service.id)}">
        <span><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(categoryName(service.category))} · ${escapeHtml(service.shortName)}</small></span>
        <span class="service-meta">${service.duration} Min.<br>${service.priceFrom ? "ab " : ""}${Number(service.price).toFixed(0)} €</span>
        <span class="service-publish-state">${service.isActive ? "Online" : "Offline"}</span>
      </button>
    `).join("");
  }

  function renderCategorySelect(selected) {
    const select = document.getElementById("serviceCategory");
    select.innerHTML = categories().map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.isActive ? "" : " (offline)"}</option>`).join("");
    if (categories().some((category) => category.id === selected)) select.value = selected;
  }

  function renderCategoryList() {
    categoryList.innerHTML = categories().map((category) => `
      <button class="settings-service-item ${category.id === selectedCategoryId ? "selected" : ""} ${category.isActive ? "" : "inactive"}" type="button" data-category-id="${escapeHtml(category.id)}">
        <span><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(category.nameEn || "Keine englische Übersetzung")}</small></span>
        <span class="service-meta">Position ${category.sortOrder}</span>
        <span class="service-publish-state">${category.isActive ? "Online" : "Offline"}</span>
      </button>
    `).join("");
  }

  function renderOccupiedSlots(selected = []) {
    const count = Number(duration.value) / 30;
    occupiedOptions.innerHTML = Array.from({ length: count }, (_, index) => {
      const slot = index + 1;
      const start = index * 30;
      const label = `${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")}–${Math.floor((start + 30) / 60)}:${String((start + 30) % 60).padStart(2, "0")}`;
      return `<label><input type="checkbox" name="occupiedSlot" value="${slot}" ${selected.includes(slot) ? "checked" : ""}><span>${label}</span></label>`;
    }).join("");
  }

  function renderStaffOptions(selected = new Set(staff.map((employee) => employee.staffKey))) {
    staffOptions.innerHTML = staff.map((employee) => `
      <label><input type="checkbox" name="serviceStaff" value="${escapeHtml(employee.staffKey)}" ${selected.has(employee.staffKey) ? "checked" : ""}><span>${escapeHtml(employee.name)}</span></label>
    `).join("");
  }

  function editService(id) {
    const service = services().find((item) => item.id === id);
    if (!service) return;
    selectedId = service.id;
    document.getElementById("serviceEditorTitle").textContent = "Service bearbeiten";
    document.getElementById("serviceId").value = service.id;
    document.getElementById("serviceName").value = service.name;
    document.getElementById("serviceNameEn").value = service.nameEn || "";
    document.getElementById("serviceNameZh").value = service.nameZh || "";
    document.getElementById("serviceShortName").value = service.shortName || service.name.slice(0, 12);
    renderCategorySelect(service.category);
    duration.value = String(service.duration);
    document.getElementById("servicePrice").value = String(service.price);
    document.getElementById("servicePriceFrom").checked = service.priceFrom;
    document.getElementById("serviceActive").checked = service.isActive;
    document.getElementById("serviceState").textContent = service.isActive ? "Online" : "Offline";
    message.textContent = "";
    renderOccupiedSlots(service.bookedSlots);
    renderStaffOptions(assignedStaff(service.id));
    renderList();
  }

  function newService() {
    selectedId = "";
    form.reset();
    document.getElementById("serviceId").value = "";
    document.getElementById("serviceEditorTitle").textContent = "Neuer Service";
    document.getElementById("serviceState").textContent = "Entwurf";
    duration.value = "30";
    renderCategorySelect(categories().find((category) => category.isActive)?.id);
    document.getElementById("serviceActive").checked = true;
    document.getElementById("serviceState").textContent = "Online";
    renderOccupiedSlots([1]);
    renderStaffOptions();
    renderList();
    document.getElementById("serviceName").focus();
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service-id]");
    if (button) editService(button.dataset.serviceId);
  });
  function editCategory(id) {
    const category = categories().find((item) => item.id === id);
    if (!category) return;
    selectedCategoryId = category.id;
    document.getElementById("categoryEditorTitle").textContent = "Kategorie bearbeiten";
    document.getElementById("categoryId").value = category.id;
    document.getElementById("categoryName").value = category.name;
    document.getElementById("categoryNameEn").value = category.nameEn || "";
    document.getElementById("categoryNameZh").value = category.nameZh || "";
    document.getElementById("categorySortOrder").value = String(category.sortOrder);
    document.getElementById("categoryActive").checked = category.isActive;
    document.getElementById("categoryState").textContent = category.isActive ? "Online" : "Offline";
    categoryMessage.textContent = "";
    renderCategoryList();
  }

  function newCategory() {
    selectedCategoryId = "";
    categoryForm.reset();
    document.getElementById("categoryId").value = "";
    document.getElementById("categoryEditorTitle").textContent = "Neue Kategorie";
    document.getElementById("categorySortOrder").value = String(categories().length + 1);
    document.getElementById("categoryActive").checked = true;
    document.getElementById("categoryState").textContent = "Online";
    renderCategoryList();
    document.getElementById("categoryName").focus();
  }

  document.querySelectorAll("[data-settings-tab]").forEach((button) => button.addEventListener("click", () => {
    const showCategories = button.dataset.settingsTab === "categories";
    document.getElementById("servicesSettings").hidden = showCategories;
    document.getElementById("categoriesSettings").hidden = !showCategories;
    document.querySelectorAll("[data-settings-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
      tab.toggleAttribute("aria-current", tab === button);
    });
    if (showCategories && !selectedCategoryId) editCategory(categories()[0]?.id);
  }));
  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-id]");
    if (button) editCategory(button.dataset.categoryId);
  });
  document.getElementById("addCategory").addEventListener("click", newCategory);
  document.getElementById("cancelCategoryEdit").addEventListener("click", () => selectedCategoryId ? editCategory(selectedCategoryId) : editCategory(categories()[0]?.id));
  document.getElementById("categoryActive").addEventListener("change", (event) => {
    document.getElementById("categoryState").textContent = event.target.checked ? "Online" : "Offline";
  });
  categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("categoryName").value.trim();
    if (name.length < 2) { categoryMessage.textContent = "Bitte einen Namen mit mindestens zwei Zeichen eingeben."; return; }
    let id = document.getElementById("categoryId").value;
    if (!id) {
      const existingIds = new Set(categories().map((category) => category.id));
      const base = `template_${slug(name)}`;
      id = base;
      let suffix = 2;
      while (existingIds.has(id)) id = `${base}_${suffix++}`;
    }
    const saved = repository.saveCategory({
      id,
      name,
      nameEn: document.getElementById("categoryNameEn").value.trim(),
      nameZh: document.getElementById("categoryNameZh").value.trim(),
      sortOrder: Number(document.getElementById("categorySortOrder").value),
      isActive: document.getElementById("categoryActive").checked,
    });
    selectedCategoryId = saved.id;
    editCategory(saved.id);
    showToast(`${saved.name} wurde lokal gespeichert.`);
  });
  document.getElementById("addService").addEventListener("click", newService);
  document.getElementById("cancelServiceEdit").addEventListener("click", () => selectedId ? editService(selectedId) : editService(services()[0]?.id));
  duration.addEventListener("change", () => {
    const checked = [...form.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
    renderOccupiedSlots(checked.filter((slot) => slot <= Number(duration.value) / 30));
  });
  document.getElementById("serviceActive").addEventListener("change", (event) => {
    document.getElementById("serviceState").textContent = event.target.checked ? "Online" : "Offline";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("serviceName").value.trim();
    const shortName = document.getElementById("serviceShortName").value.trim();
    const bookedSlots = [...form.querySelectorAll('[name="occupiedSlot"]:checked')].map((input) => Number(input.value));
    const staffKeys = [...form.querySelectorAll('[name="serviceStaff"]:checked')].map((input) => input.value);
    if (name.length < 2) { message.textContent = "Bitte einen Namen mit mindestens zwei Zeichen eingeben."; return; }
    if (!shortName) { message.textContent = "Bitte einen Kurznamen eingeben."; return; }
    if (bookedSlots.length === 0) { message.textContent = "Mindestens ein belegter Zeitabschnitt ist erforderlich."; return; }
    if (staffKeys.length === 0) { message.textContent = "Bitte mindestens einen Mitarbeiter auswählen."; return; }
    const existingIds = new Set(services().map((service) => service.id));
    let id = document.getElementById("serviceId").value;
    if (!id) {
      const base = `template_${slug(name)}`;
      id = base;
      let suffix = 2;
      while (existingIds.has(id)) id = `${base}_${suffix++}`;
    }
    const saved = repository.saveService({
      id,
      name,
      nameEn: document.getElementById("serviceNameEn").value.trim(),
      nameZh: document.getElementById("serviceNameZh").value.trim(),
      shortName,
      category: document.getElementById("serviceCategory").value,
      gender: "unisex",
      duration: Number(duration.value),
      bookedSlots,
      price: Number(document.getElementById("servicePrice").value),
      priceFrom: document.getElementById("servicePriceFrom").checked,
      isActive: document.getElementById("serviceActive").checked,
    });
    repository.setServiceStaff(saved.id, staffKeys);
    selectedId = saved.id;
    editService(saved.id);
    showToast(`${saved.name} wurde lokal gespeichert.`);
  });

  repository.subscribe("services", () => {
    if (selectedId && services().some((service) => service.id === selectedId)) editService(selectedId);
    else renderList();
  });
  repository.subscribe("categories", () => {
    renderCategoryList();
    if (selectedId) editService(selectedId);
  });
  const initial = services()[0];
  if (initial) editService(initial.id); else newService();
})();
