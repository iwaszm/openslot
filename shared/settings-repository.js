(function exposeSupabaseSettingsRepository(global) {
  "use strict";

  const config = global.OPENSLOT_SUPABASE;
  if (!config?.url || !config?.anonKey || !global.supabase?.createClient) {
    throw new Error("Supabase configuration is unavailable.");
  }

  const client = global.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const listeners = new Set();
  let salonSlug = "";
  let snapshot = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const emit = () => listeners.forEach((listener) => listener(getCachedSnapshot()));
  const rpc = async (name, parameters) => {
    const { data, error } = await client.rpc(name, parameters);
    if (error) throw error;
    return data;
  };

  function normalizeSnapshot(data) {
    const categories = (data?.categories || []).map((category) => ({
      id: category.id,
      name: category.name,
      nameEn: category.name_en || "",
      nameZh: category.name_zh || "",
      shortName: category.short_name,
      sortOrder: Number(category.sort_order || 0),
      isActive: category.is_active !== false,
      acceptsOnline: category.accepts_online_bookings !== false,
    }));
    const services = (data?.services || []).map((service) => ({
      id: service.id,
      categoryId: service.category_id,
      name: service.name,
      nameEn: service.name_en || "",
      nameZh: service.name_zh || "",
      shortName: service.short_name,
      duration: Number(service.duration_minutes),
      bookedSlots: (service.booked_slots || []).map(Number),
      price: Number(service.price),
      priceFrom: service.price_from === true,
      color: service.slot_color,
      sortOrder: Number(service.sort_order || 0),
      isActive: service.is_active !== false,
      acceptsOnline: service.accepts_online_bookings !== false,
    }));
    const staff = (data?.staff || []).map((employee) => ({
      id: employee.id,
      staffKey: employee.staff_key,
      name: employee.name,
      shortName: employee.short_name,
      color: employee.display_color,
      sortOrder: Number(employee.sort_order || 0),
      isActive: employee.is_active !== false,
      acceptsOnline: employee.accepts_online_bookings === true,
    }));
    const staffServices = (data?.staff_services || []).map((assignment) => ({
      staffId: assignment.staff_id,
      serviceId: assignment.service_id,
      isActive: assignment.is_active !== false,
      acceptsOnline: assignment.accepts_online_bookings !== false,
    }));
    const weeklyHours = (data?.weekly_hours || []).map((hours) => ({
      weekday: Number(hours.weekday),
      openTime: String(hours.open_time || "10:00").slice(0, 5),
      closeTime: String(hours.close_time || "18:00").slice(0, 5),
      isClosed: hours.is_closed === true,
    }));

    return {
      account: {
        email: data?.account?.email || "",
        role: data?.account?.role || "staff",
        staffId: data?.account?.staff_id || null,
      },
      salon: {
        id: data?.salon?.id,
        slug: data?.salon?.slug,
        name: data?.salon?.name || "",
        address: data?.salon?.address || "",
        phone: data?.salon?.phone || "",
        timezone: data?.salon?.timezone || "Europe/Berlin",
        themePreset: data?.salon?.theme_preset || "lime",
        languages: data?.salon?.languages || ["de", "en", "zh"],
      },
      categories: categories.sort((left, right) => left.sortOrder - right.sortOrder),
      services: services.sort((left, right) => left.sortOrder - right.sortOrder),
      staff: staff.sort((left, right) => left.sortOrder - right.sortOrder),
      staffServices,
      weeklyHours: weeklyHours.sort((left, right) => left.weekday - right.weekday),
    };
  }

  function getCachedSnapshot() {
    if (!snapshot) throw new Error("Settings have not been loaded.");
    return clone(snapshot);
  }

  async function reload() {
    const data = await rpc("get_settings_snapshot", { p_salon_slug: salonSlug });
    snapshot = normalizeSnapshot(data);
    document.documentElement.dataset.shopTheme = snapshot.salon.themePreset;
    emit();
    return getCachedSnapshot();
  }

  const repository = {
    client,
    async initialize(slug) {
      salonSlug = String(slug || "").trim();
      if (!salonSlug) throw new Error("Salon slug is missing.");
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session) return null;
      return reload();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSettingsSnapshot: getCachedSnapshot,
    async updatePassword(password) {
      if (typeof password !== "string" || password.length < 8) {
        throw new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
      }
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    async updateSalon(input) {
      await rpc("update_salon_settings", {
        p_salon_id: snapshot.salon.id,
        p_name: input.name,
        p_address: input.address,
        p_phone: input.phone,
        p_theme_preset: input.themePreset,
        p_languages: input.languages,
      });
      return reload();
    },
    async updateWeeklyHours(hours) {
      await rpc("replace_salon_weekly_hours", {
        p_salon_id: snapshot.salon.id,
        p_hours: hours.map((entry) => ({
          weekday: entry.weekday,
          open_time: entry.openTime,
          close_time: entry.closeTime,
          is_closed: entry.isClosed,
        })),
      });
      return reload();
    },
    async updateStaff(input) {
      await rpc("update_salon_staff_profile", {
        p_salon_id: snapshot.salon.id,
        p_staff_id: input.id,
        p_name: input.name,
        p_short_name: input.shortName,
        p_display_color: input.color,
        p_sort_order: input.sortOrder,
        p_is_active: input.isActive,
        p_accepts_online_bookings: input.acceptsOnline,
      });
      return reload();
    },
    async updateStaffServices(staffId, serviceIds) {
      await rpc("replace_staff_services", {
        p_salon_id: snapshot.salon.id,
        p_staff_id: staffId,
        p_service_ids: serviceIds,
      });
      return reload();
    },
    async saveCategory(input) {
      const id = await rpc("save_service_category", {
        p_salon_id: snapshot.salon.id,
        p_category_id: input.id || null,
        p_name: input.name,
        p_name_en: input.nameEn || null,
        p_name_zh: input.nameZh || null,
        p_short_name: input.shortName,
        p_is_active: input.isActive,
        p_accepts_online_bookings: input.acceptsOnline,
      });
      await reload();
      return snapshot.categories.find((category) => category.id === id);
    },
    async saveService(input) {
      const id = await rpc("save_salon_service", {
        p_salon_id: snapshot.salon.id,
        p_service_id: input.id || null,
        p_category_id: input.categoryId,
        p_name: input.name,
        p_name_en: input.nameEn || null,
        p_name_zh: input.nameZh || null,
        p_short_name: input.shortName,
        p_duration_minutes: input.duration,
        p_booked_slots: input.bookedSlots,
        p_price: input.price,
        p_price_from: input.priceFrom,
        p_slot_color: input.color,
        p_is_active: input.isActive,
        p_accepts_online_bookings: input.acceptsOnline,
      });
      await reload();
      return snapshot.services.find((service) => service.id === id);
    },
    async archiveCategory(id) {
      await rpc("archive_service_category", {
        p_salon_id: snapshot.salon.id,
        p_category_id: id,
      });
      return reload();
    },
    async archiveService(id) {
      await rpc("archive_salon_service", {
        p_salon_id: snapshot.salon.id,
        p_service_id: id,
      });
      return reload();
    },
    async reorderCatalog(order) {
      await rpc("reorder_service_catalog", {
        p_salon_id: snapshot.salon.id,
        p_category_ids: order.categoryIds,
        p_service_ids: order.serviceIds,
        p_service_category_ids: order.serviceCategoryIds,
      });
      return reload();
    },
  };

  global.OpenSlotRepositoryContract?.assert(repository, "settings");
  global.OpenSlotSettingsRepository = Object.freeze(repository);
})(window);
