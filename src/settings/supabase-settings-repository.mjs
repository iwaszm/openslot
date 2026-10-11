const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeSnapshot(data) {
  const activity = (item) => ({ isActive: item.is_active !== false, acceptsOnline: item.accepts_online_bookings !== false });
  return {
    account: { email: data?.account?.email || "", role: data?.account?.role || "staff", staffId: data?.account?.staff_id || null },
    salon: {
      id: data?.salon?.id, slug: data?.salon?.slug, name: data?.salon?.name || "",
      address: data?.salon?.address || "", phone: data?.salon?.phone || "",
      timezone: data?.salon?.timezone || "Europe/Berlin", themePreset: data?.salon?.theme_preset || "lime",
      adminLanguage: data?.salon?.admin_language || "de", languages: data?.salon?.languages || ["de", "en", "zh"],
    },
    categories: (data?.categories || []).map((item) => ({
      id: item.id, name: item.name, nameEn: item.name_en || "", nameZh: item.name_zh || "",
      shortName: item.short_name, sortOrder: Number(item.sort_order || 0), ...activity(item),
    })).sort((a, b) => a.sortOrder - b.sortOrder),
    services: (data?.services || []).map((item) => ({
      id: item.id, categoryId: item.category_id, name: item.name, nameEn: item.name_en || "", nameZh: item.name_zh || "",
      shortName: item.short_name, duration: Number(item.duration_minutes), bookedSlots: (item.booked_slots || []).map(Number),
      price: Number(item.price), priceFrom: item.price_from === true, color: item.slot_color,
      sortOrder: Number(item.sort_order || 0), ...activity(item),
    })).sort((a, b) => a.sortOrder - b.sortOrder),
    staff: (data?.staff || []).map((item) => ({
      id: item.id, staffKey: item.staff_key, name: item.name, shortName: item.short_name,
      color: item.display_color, sortOrder: Number(item.sort_order || 0),
      isActive: item.is_active !== false, acceptsOnline: item.accepts_online_bookings === true,
    })).sort((a, b) => a.sortOrder - b.sortOrder),
    staffServices: (data?.staff_services || []).map((item) => ({ staffId: item.staff_id, serviceId: item.service_id, ...activity(item) })),
    weeklyHours: (data?.weekly_hours || []).map((item) => ({
      weekday: Number(item.weekday), openTime: String(item.open_time || "10:00").slice(0, 5),
      closeTime: String(item.close_time || "18:00").slice(0, 5), isClosed: item.is_closed === true,
    })).sort((a, b) => a.weekday - b.weekday),
  };
}

export function createSupabaseSettingsRepository({ config, supabase }) {
  if (!config?.url || !config?.anonKey || !supabase?.createClient) throw new Error("Supabase configuration is unavailable.");
  const client = supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const listeners = new Set();
  let salonSlug = "";
  let snapshot = null;
  const getSettingsSnapshot = () => {
    if (!snapshot) throw new Error("Settings have not been loaded.");
    return clone(snapshot);
  };
  const rpc = async (name, parameters) => {
    const { data, error } = await client.rpc(name, parameters);
    if (error) throw error;
    return data;
  };
  const reload = async () => {
    snapshot = normalizeSnapshot(await rpc("get_settings_snapshot", { p_salon_slug: salonSlug }));
    document.documentElement.dataset.shopTheme = snapshot.salon.themePreset;
    listeners.forEach((listener) => listener(getSettingsSnapshot()));
    return getSettingsSnapshot();
  };
  return Object.freeze({
    client,
    async initialize(slug) {
      salonSlug = String(slug || "").trim();
      if (!salonSlug) throw new Error("Salon slug is missing.");
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session ? reload() : null;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSettingsSnapshot,
    async updatePassword(password) {
      if (typeof password !== "string" || password.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async updateSalon(input) {
      await rpc("update_salon_settings", { p_salon_id: snapshot.salon.id, p_name: input.name, p_address: input.address,
        p_phone: input.phone, p_theme_preset: input.themePreset, p_admin_language: input.adminLanguage, p_languages: input.languages });
      return reload();
    },
    async updateWeeklyHours(hours) {
      await rpc("replace_salon_weekly_hours", { p_salon_id: snapshot.salon.id, p_hours: hours.map((item) => ({
        weekday: item.weekday, open_time: item.openTime, close_time: item.closeTime, is_closed: item.isClosed,
      })) });
      return reload();
    },
    async updateStaff(input) {
      await rpc("update_salon_staff_profile", { p_salon_id: snapshot.salon.id, p_staff_id: input.id, p_name: input.name,
        p_short_name: input.shortName, p_display_color: input.color, p_sort_order: input.sortOrder,
        p_is_active: input.isActive, p_accepts_online_bookings: input.acceptsOnline });
      return reload();
    },
    async updateStaffServices(staffId, serviceIds) {
      await rpc("replace_staff_services", { p_salon_id: snapshot.salon.id, p_staff_id: staffId, p_service_ids: serviceIds });
      return reload();
    },
    async saveCategory(input) {
      const id = await rpc("save_service_category", { p_salon_id: snapshot.salon.id, p_category_id: input.id || null,
        p_name: input.name, p_name_en: input.nameEn || null, p_name_zh: input.nameZh || null,
        p_short_name: input.shortName, p_is_active: input.isActive, p_accepts_online_bookings: input.acceptsOnline });
      await reload();
      return snapshot.categories.find((item) => item.id === id);
    },
    async saveService(input) {
      const id = await rpc("save_salon_service", { p_salon_id: snapshot.salon.id, p_service_id: input.id || null,
        p_category_id: input.categoryId, p_name: input.name, p_name_en: input.nameEn || null, p_name_zh: input.nameZh || null,
        p_short_name: input.shortName, p_duration_minutes: input.duration, p_booked_slots: input.bookedSlots,
        p_price: input.price, p_price_from: input.priceFrom, p_slot_color: input.color,
        p_is_active: input.isActive, p_accepts_online_bookings: input.acceptsOnline });
      await reload();
      return snapshot.services.find((item) => item.id === id);
    },
    async reorderCatalog(order) {
      await rpc("reorder_service_catalog", { p_salon_id: snapshot.salon.id, p_category_ids: order.categoryIds,
        p_service_ids: order.serviceIds, p_service_category_ids: order.serviceCategoryIds });
      return reload();
    },
  });
}
