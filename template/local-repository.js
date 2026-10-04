(() => {
  const runtime = window.OPENSLOT_RUNTIME;
  if (runtime?.environment !== "template" || runtime?.dataSource !== "local") {
    throw new Error("The template repository requires the isolated local runtime.");
  }

  const namespace = runtime.namespace;
  const servicesKey = `${namespace}.services`;
  const staffServicesKey = `${namespace}.staff-services`;
  const categoriesKey = `${namespace}.service-categories`;
  const openingHoursKey = `${namespace}.opening-hours`;
  const staffKey = `${namespace}.staff`;
  const profileKey = `${namespace}.shop-profile`;
  const channelName = `${namespace}.changes`;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(channelName) : null;
  const listeners = new Set();
  const defaultStaff = [
    { staffKey: "default", name: "Mitarbeiter 1", shortName: "M1", color: "#d7ef57", isOwner: true, laneCount: 2, sortOrder: 1, isActive: true, acceptsOnline: true },
    { staffKey: "tony", name: "Mitarbeiter 2", shortName: "M2", color: "#b8d9d0", isOwner: false, laneCount: 2, sortOrder: 2, isActive: true, acceptsOnline: true },
    { staffKey: "facial", name: "Mitarbeiterin 3", shortName: "M3", color: "#c9c3e6", isOwner: false, laneCount: 2, sortOrder: 3, isActive: true, acceptsOnline: true },
  ];
  const defaultCategories = [
    { id: "cut", name: "Haarschnitt", shortName: "Schnitt", nameEn: "Haircuts", nameZh: "剪发", sortOrder: 1, isActive: true },
    { id: "color", name: "Farbe", shortName: "Farbe", nameEn: "Colour", nameZh: "染发", sortOrder: 2, isActive: true },
    { id: "care", name: "Pflege & Styling", shortName: "Pflege", nameEn: "Care & styling", nameZh: "护理与造型", sortOrder: 3, isActive: true },
    { id: "shape", name: "Umformung", shortName: "Form", nameEn: "Texture", nameZh: "烫发", sortOrder: 4, isActive: true },
    { id: "facial", name: "Gesichtspflege", shortName: "Gesicht", nameEn: "Facial care", nameZh: "面部护理", sortOrder: 5, isActive: true },
  ];
  const defaultServices = [
    { id: "damen_haarschnitt", name: "Damen Haarschnitt", shortName: "SchnittD", duration: 60, bookedSlots: [1, 2], price: 30, priceFrom: false, category: "cut", gender: "female", isActive: true },
    { id: "herren_haarschnitt", name: "Herren Haarschnitt", shortName: "SchnittH", duration: 30, bookedSlots: [1], price: 22, priceFrom: false, category: "cut", gender: "male", isActive: true },
    { id: "waschen_foehnen_styling", name: "Waschen, Föhnen, Styling", shortName: "WFS", duration: 30, bookedSlots: [1], price: 15, priceFrom: false, category: "care", gender: "unisex", isActive: true },
    { id: "haarefarben", name: "Haarefarben", shortName: "Farb", duration: 120, bookedSlots: [1, 4], price: 30, priceFrom: true, category: "color", gender: "unisex", isActive: true },
    { id: "dauerwelle", name: "Dauerwelle", shortName: "Dauer", duration: 120, bookedSlots: [1, 4], price: 50, priceFrom: true, category: "shape", gender: "unisex", isActive: true },
    { id: "pflegen", name: "Pflegen", shortName: "Pflegen", duration: 30, bookedSlots: [1], price: 25, priceFrom: false, category: "care", gender: "unisex", isActive: true },
    { id: "straehnen", name: "Strähnen", shortName: "Stra", duration: 120, bookedSlots: [1, 4], price: 40, priceFrom: true, category: "color", gender: "unisex", isActive: true },
    { id: "blondierung", name: "Blondieren", shortName: "Blond", duration: 120, bookedSlots: [1, 4], price: 45, priceFrom: true, category: "color", gender: "unisex", isActive: true },
    { id: "ionen_dauerwelle", name: "Ionen Dauerwelle", shortName: "IDauer", duration: 240, bookedSlots: [1, 2, 4, 5, 7, 8], price: 120, priceFrom: true, category: "shape", gender: "unisex", isActive: true },
    { id: "digitale_dauerwelle", name: "Digitale Dauerwelle", shortName: "DDauer", duration: 240, bookedSlots: [1, 2, 4, 5, 7, 8], price: 120, priceFrom: true, category: "shape", gender: "unisex", isActive: true },
    { id: "klassische_gesichtsbehandlung", name: "Klassische Gesichtsbehandlung", nameEn: "Classic facial", nameZh: "经典面部护理", shortName: "Gesicht", duration: 60, bookedSlots: [1, 2], price: 55, priceFrom: false, category: "facial", color: "#eee5f3", gender: "unisex", isActive: true },
  ];
  const defaultOpeningHours = [
    { day: 1, openMinutes: 600, closeMinutes: 1080, isOpen: true },
    { day: 2, openMinutes: 600, closeMinutes: 1080, isOpen: true },
    { day: 3, openMinutes: 600, closeMinutes: 1080, isOpen: true },
    { day: 4, openMinutes: 600, closeMinutes: 1080, isOpen: true },
    { day: 5, openMinutes: 600, closeMinutes: 1080, isOpen: true },
    { day: 6, openMinutes: 600, closeMinutes: 1020, isOpen: true },
    { day: 0, openMinutes: null, closeMinutes: null, isOpen: false },
  ];
  const themePresets = Object.freeze({ lime: "#dfff2f", pink: "#fbc8bf", glacier: "#67cbef" });
  const defaultProfile = { name: "Berlin Hair Salon", address: "Niebuhrstraße 66, 10629 Berlin", phone: "0176 41164231", email: "info@openslotberlin.de", themePreset: "lime", languages: ["de", "en", "zh"] };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return clone(fallback); }
  };
  const normalizeService = (service) => {
    const duration = Math.max(30, Math.min(480, Math.round(Number(service.duration || 30) / 30) * 30));
    const slotCount = duration / 30;
    const bookedSlots = [...new Set((Array.isArray(service.bookedSlots) ? service.bookedSlots : [1])
      .map(Number).filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= slotCount))].sort((a, b) => a - b);
    const fallbackColors = { cut: "#dfeee8", color: "#f6e5e7", care: "#e4f1f7", shape: "#ebe8f4", facial: "#eee5f3" };
    return {
      id: String(service.id || "").trim(),
      name: String(service.name || "").trim(),
      nameEn: String(service.nameEn || "").trim().slice(0, 50),
      nameZh: String(service.nameZh || "").trim().slice(0, 50),
      shortName: String(service.shortName || service.name || "").trim().slice(0, 12),
      category: String(service.category || "care").trim(),
      color: /^#[0-9a-f]{6}$/i.test(service.color) ? service.color.toLowerCase() : fallbackColors[service.category] || "#e7ece8",
      sortOrder: Math.max(1, Math.round(Number(service.sortOrder || 999))),
      gender: ["female", "male", "unisex"].includes(service.gender) ? service.gender : "unisex",
      duration,
      bookedSlots: bookedSlots.length ? bookedSlots : [1],
      price: Math.max(0, Number(service.price || 0)),
      priceFrom: service.priceFrom === true,
      isActive: service.isActive !== false,
      acceptsOnline: service.acceptsOnline !== false,
    };
  };
  const ensureServices = () => {
    const saved = read(servicesKey, null);
    if (!Array.isArray(saved) || saved.length === 0) {
      const normalizedDefaults = defaultServices.map(normalizeService);
      localStorage.setItem(servicesKey, JSON.stringify(normalizedDefaults));
      return clone(normalizedDefaults);
    }
    const categoryPositions = new Map();
    const services = saved.map((entry) => {
      const service = normalizeService(entry);
      const next = (categoryPositions.get(service.category) || 0) + 1;
      categoryPositions.set(service.category, next);
      if (!Number.isFinite(Number(entry.sortOrder))) service.sortOrder = next;
      return service;
    });
    const facialService = defaultServices.find((service) => service.id === "klassische_gesichtsbehandlung");
    if (!services.some((service) => service.id === facialService.id)) {
      services.push(normalizeService(facialService));
      localStorage.setItem(servicesKey, JSON.stringify(services));
    }
    return services;
  };
  const normalizeCategory = (category) => ({
    id: String(category.id || "").trim(),
    name: String(category.name || "").trim().slice(0, 50),
    shortName: String(category.shortName || category.name || "").trim().slice(0, 12),
    nameEn: String(category.nameEn || "").trim().slice(0, 50),
    nameZh: String(category.nameZh || "").trim().slice(0, 50),
    sortOrder: Math.max(1, Math.round(Number(category.sortOrder || 1))),
    isActive: category.isActive !== false,
    acceptsOnline: category.acceptsOnline !== false,
  });
  const ensureCategories = () => {
    const saved = read(categoriesKey, null);
    if (!Array.isArray(saved) || !saved.length) {
      const normalizedDefaults = defaultCategories.map(normalizeCategory);
      localStorage.setItem(categoriesKey, JSON.stringify(normalizedDefaults));
      return clone(normalizedDefaults);
    }
    const categories = saved.map(normalizeCategory);
    const facialCategory = defaultCategories.find((category) => category.id === "facial");
    if (!categories.some((category) => category.id === facialCategory.id)) {
      categories.push(normalizeCategory(facialCategory));
      localStorage.setItem(categoriesKey, JSON.stringify(categories));
    }
    return categories;
  };
  const ensureStaffServices = () => {
    const saved = read(staffServicesKey, null);
    if (Array.isArray(saved)) {
      const assignments = [...saved];
      if (!assignments.some((assignment) => assignment.serviceId === "klassische_gesichtsbehandlung")) {
        assignments.push({ staffKey: "facial", serviceId: "klassische_gesichtsbehandlung" });
      }
      if (JSON.stringify(assignments) !== JSON.stringify(saved)) localStorage.setItem(staffServicesKey, JSON.stringify(assignments));
      return assignments;
    }
    const assignments = ensureServices().flatMap((service) => listStaff({ includeInactive: true })
      .filter((employee) => service.category === "facial" ? employee.staffKey === "facial" : employee.staffKey !== "facial")
      .map((employee) => ({
      staffKey: employee.staffKey,
      serviceId: service.id,
    })));
    localStorage.setItem(staffServicesKey, JSON.stringify(assignments));
    return assignments;
  };
  const fallbackStaffColor = (staffId) => {
    const palette = ["#d7ef57", "#b8d9d0", "#f0c5bf", "#c9c3e6", "#edcf91"];
    const score = [...String(staffId || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palette[score % palette.length];
  };
  const normalizeStaff = (employee) => {
    const sortOrder = Math.max(1, Math.round(Number(employee.sortOrder || 999)));
    return {
      staffKey: String(employee.staffKey || "").trim(),
      name: String(employee.name || "").trim().slice(0, 50),
      shortName: String(employee.shortName || `M${sortOrder}`).trim().slice(0, 12),
      color: /^#[0-9a-f]{6}$/i.test(employee.color) ? employee.color.toLowerCase() : fallbackStaffColor(employee.staffKey),
      isOwner: employee.isOwner === true,
      laneCount: 2,
      sortOrder,
      isActive: employee.isActive !== false,
      acceptsOnline: employee.acceptsOnline !== false,
    };
  };
  function ensureStaff() {
    const saved = read(staffKey, null);
    if (!Array.isArray(saved) || !saved.length) { localStorage.setItem(staffKey, JSON.stringify(defaultStaff)); return clone(defaultStaff); }
    const normalized = saved.map(normalizeStaff);
    const facialEmployee = defaultStaff.find((employee) => employee.staffKey === "facial");
    if (!normalized.some((employee) => employee.staffKey === facialEmployee.staffKey)) normalized.push(normalizeStaff(facialEmployee));
    if (!saved.some((employee) => Object.prototype.hasOwnProperty.call(employee, "isOwner"))) normalized[0].isOwner = true;
    let ownerSeen = false;
    normalized.forEach((employee) => {
      if (!employee.isOwner) return;
      if (ownerSeen) employee.isOwner = false;
      ownerSeen = true;
    });
    if (JSON.stringify(saved) !== JSON.stringify(normalized)) localStorage.setItem(staffKey, JSON.stringify(normalized));
    return normalized;
  }
  const normalizeOpeningHour = (entry) => {
    const isOpen = entry?.isOpen !== false;
    const openMinutes = Math.max(0, Math.min(1410, Math.round(Number(entry?.openMinutes ?? 600) / 30) * 30));
    const closeMinutes = Math.max(openMinutes + 30, Math.min(1440, Math.round(Number(entry?.closeMinutes ?? 1080) / 30) * 30));
    return { day: Number(entry?.day), openMinutes: isOpen ? openMinutes : null, closeMinutes: isOpen ? closeMinutes : null, isOpen };
  };
  const listOpeningHours = () => {
    const saved = read(openingHoursKey, null);
    const rows = Array.isArray(saved) && saved.length === 7 ? saved : defaultOpeningHours;
    if (rows === defaultOpeningHours) localStorage.setItem(openingHoursKey, JSON.stringify(defaultOpeningHours));
    return clone(rows.map(normalizeOpeningHour));
  };
  const saveOpeningHours = (rows) => {
    if (!Array.isArray(rows) || rows.length !== 7 || new Set(rows.map((row) => Number(row.day))).size !== 7) throw new Error("Ungültige Öffnungszeiten.");
    const normalized = rows.map(normalizeOpeningHour);
    localStorage.setItem(openingHoursKey, JSON.stringify(normalized));
    notify("opening-hours");
    return clone(normalized);
  };
  const resetOpeningHours = () => saveOpeningHours(defaultOpeningHours);
  const normalizeThemePreset = (profile) => {
    if (themePresets[profile?.themePreset]) return profile.themePreset;
    const color = String(profile?.themeColor || "").toLowerCase();
    return Object.entries(themePresets).find(([, value]) => value.toLowerCase() === color)?.[0] || "lime";
  };
  const getShopProfile = () => {
    const profile = { ...clone(defaultProfile), ...read(profileKey, {}) };
    profile.themePreset = normalizeThemePreset(profile);
    profile.themeColor = themePresets[profile.themePreset];
    return profile;
  };
  const saveShopProfile = (input) => {
    const current = getShopProfile();
    const profile = {
      name: String(input.name || "").trim().slice(0, 80), address: String(input.address ?? current.address).trim().slice(0, 120),
      phone: String(input.phone || "").trim().slice(0, 30), email: String(input.email ?? current.email).trim().slice(0, 80),
      themePreset: themePresets[input.themePreset] ? input.themePreset : normalizeThemePreset(current),
      languages: Array.isArray(input.languages) ? input.languages.filter((value, index, all) => ["de", "en", "zh"].includes(value) && all.indexOf(value) === index) : [],
    };
    if (profile.name.length < 2 || !profile.address || !profile.phone || !profile.email || profile.languages.length !== 3) throw new Error("Ungültige Shop-Daten.");
    localStorage.setItem(profileKey, JSON.stringify(profile)); notify("shop-profile"); return getShopProfile();
  };
  const notify = (entity) => {
    const detail = { entity, updatedAt: Date.now() };
    channel?.postMessage(detail);
    window.dispatchEvent(new CustomEvent("openslot:local-data-change", { detail }));
  };
  const listServices = (options = {}) => {
    const services = ensureServices();
    const categories = new Map(ensureCategories().map((category) => [category.id, category]));
    const visible = options.includeInactive
      ? services
      : services.filter((service) => service.isActive && categories.get(service.category)?.isActive !== false);
    return clone(visible.map((service) => {
      const category = categories.get(service.category);
      return {
        ...service,
        categoryName: category?.name || "",
        categoryNameEn: category?.nameEn || "",
        categoryNameZh: category?.nameZh || "",
        categorySortOrder: category?.sortOrder || 999,
      };
    }).sort((left, right) => left.categorySortOrder - right.categorySortOrder || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
  };
  const saveService = (input) => {
    const service = normalizeService(input);
    if (!service.id || service.name.length < 2 || service.name.length > 50) throw new Error("Ungültige Service-Daten.");
    const services = ensureServices();
    const index = services.findIndex((item) => item.id === service.id);
    if (index >= 0) services[index] = service;
    else services.push(service);
    localStorage.setItem(servicesKey, JSON.stringify(services));
    notify("services");
    return clone(service);
  };
  function listStaff(options = {}) { return clone(ensureStaff().filter((employee) => options.includeInactive || employee.isActive).sort((a, b) => a.sortOrder - b.sortOrder)); }
  const saveStaff = (input) => {
    const employee = normalizeStaff(input);
    if (!employee.staffKey || employee.name.length < 2 || !employee.shortName) throw new Error("Ungültige Mitarbeiter-Daten.");
    const employees = ensureStaff(); const index = employees.findIndex((item) => item.staffKey === employee.staffKey);
    if (employee.isOwner) employees.forEach((item) => { item.isOwner = false; });
    if (index >= 0) employees[index] = employee; else employees.push(employee);
    localStorage.setItem(staffKey, JSON.stringify(employees)); notify("staff"); return clone(employee);
  };
  const listStaffServices = () => clone(ensureStaffServices());
  const setServiceStaff = (serviceId, staffKeys) => {
    const validKeys = new Set(listStaff({ includeInactive: true }).map((employee) => employee.staffKey));
    const selected = [...new Set(staffKeys)].filter((staffKey) => validKeys.has(staffKey));
    if (!selected.length) throw new Error("Mindestens ein Mitarbeiter ist erforderlich.");
    const assignments = ensureStaffServices().filter((item) => item.serviceId !== serviceId);
    selected.forEach((staffKey) => assignments.push({ staffKey, serviceId }));
    localStorage.setItem(staffServicesKey, JSON.stringify(assignments));
    notify("staff-services");
    return clone(assignments.filter((item) => item.serviceId === serviceId));
  };
  const listCategories = (options = {}) => clone(ensureCategories()
    .filter((category) => options.includeInactive || category.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
  const saveCategory = (input) => {
    const category = normalizeCategory(input);
    if (!category.id || category.name.length < 2 || !category.shortName) throw new Error("Ungültige Kategorie-Daten.");
    const categories = ensureCategories();
    const index = categories.findIndex((item) => item.id === category.id);
    if (index >= 0) categories[index] = category;
    else categories.push(category);
    localStorage.setItem(categoriesKey, JSON.stringify(categories));
    const services = ensureServices().map((service) => (
      service.category === category.id ? { ...service, acceptsOnline: category.acceptsOnline } : service
    ));
    localStorage.setItem(servicesKey, JSON.stringify(services));
    notify("categories");
    notify("services");
    return clone(category);
  };
  const reorderCatalog = ({ categoryIds, serviceIdsByCategory }) => {
    const categoryOrder = new Map(categoryIds.map((id, index) => [id, index + 1]));
    const categories = ensureCategories().map((category) => ({
      ...category,
      sortOrder: categoryOrder.get(category.id) || category.sortOrder,
    }));
    const servicePositions = new Map();
    Object.entries(serviceIdsByCategory).forEach(([categoryId, ids]) => {
      ids.forEach((id, index) => servicePositions.set(id, { category: categoryId, sortOrder: index + 1 }));
    });
    const services = ensureServices().map((service) => ({ ...service, ...(servicePositions.get(service.id) || {}) }));
    localStorage.setItem(categoriesKey, JSON.stringify(categories));
    localStorage.setItem(servicesKey, JSON.stringify(services));
    notify("categories");
    notify("services");
  };
  const hasStoredReference = (field, id) => {
    const contains = (value) => {
      if (!value || typeof value !== "object") return false;
      if (!Array.isArray(value) && value[field] === id) return true;
      return Object.values(value).some(contains);
    };
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`${namespace}.`) || [servicesKey, staffServicesKey, categoriesKey].includes(key)) continue;
      try { if (contains(JSON.parse(localStorage.getItem(key)))) return true; } catch { /* Non-JSON local state is not a data reference. */ }
    }
    return false;
  };
  const canDeleteService = (id) => String(id).startsWith("template_") && !hasStoredReference("serviceId", id);
  const deleteService = (id) => {
    if (!canDeleteService(id)) throw new Error("Nur neue, noch nicht verwendete Services können gelöscht werden.");
    localStorage.setItem(servicesKey, JSON.stringify(ensureServices().filter((service) => service.id !== id)));
    localStorage.setItem(staffServicesKey, JSON.stringify(ensureStaffServices().filter((assignment) => assignment.serviceId !== id)));
    notify("services"); notify("staff-services");
  };
  const canDeleteCategory = (id) => String(id).startsWith("template_") && !ensureServices().some((service) => service.category === id);
  const deleteCategory = (id) => {
    if (!canDeleteCategory(id)) throw new Error("Nur neue, leere Kategorien können gelöscht werden.");
    localStorage.setItem(categoriesKey, JSON.stringify(ensureCategories().filter((category) => category.id !== id)));
    notify("categories");
  };
  const subscribe = (entity, callback) => {
    const listener = (event) => { if (!entity || event.detail?.entity === entity) callback(event.detail); };
    window.addEventListener("openslot:local-data-change", listener);
    const storageListener = (event) => {
      if ((entity === "services" && event.key === servicesKey)
        || (entity === "staff-services" && event.key === staffServicesKey)
        || (entity === "categories" && event.key === categoriesKey)
        || (entity === "opening-hours" && event.key === openingHoursKey)
        || (entity === "staff" && event.key === staffKey)
        || (entity === "shop-profile" && event.key === profileKey)) callback({ entity });
    };
    window.addEventListener("storage", storageListener);
    const channelListener = (event) => { if (!entity || event.data?.entity === entity) callback(event.data); };
    channel?.addEventListener("message", channelListener);
    return () => {
      window.removeEventListener("openslot:local-data-change", listener);
      window.removeEventListener("storage", storageListener);
      channel?.removeEventListener("message", channelListener);
    };
  };

  ensureServices();
  ensureCategories();
  ensureStaffServices();
  window.OpenSlotLocalRepository = Object.freeze({
    listServices,
    saveService,
    listStaff,
    saveStaff,
    listStaffServices,
    setServiceStaff,
    listOpeningHours,
    saveOpeningHours,
    resetOpeningHours,
    getShopProfile,
    saveShopProfile,
    listCategories,
    saveCategory,
    reorderCatalog,
    canDeleteService,
    deleteService,
    canDeleteCategory,
    deleteCategory,
    subscribe,
    servicesKey,
    staffServicesKey,
    categoriesKey,
    openingHoursKey,
    staffKey,
    profileKey,
  });
})();
