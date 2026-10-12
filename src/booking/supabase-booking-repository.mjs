import { formatMinutes, parseTime, timeValueToMinutes } from "../core/time.mjs";

export function createSupabaseBookingRepository({
  client,
  salonSlug,
  defaultServices,
  createDefaultDaySettings,
  normalizeDaySettings,
  onSalonLoaded = () => {},
}) {
  const salonPromise = loadCurrentSalon(client, salonSlug).then((salon) => {
    onSalonLoaded(salon);
    return salon;
  });

  const repository = {
    requiresTurnstile: true,

    async listServices() {
      const salon = await salonPromise;
      let { data, error } = await client
        .from("services")
        .select("id, name, name_en, name_zh, short_name, duration_minutes, booked_slots, price, price_from, is_active, accepts_online_bookings, category, category_id, category_name_en, category_name_zh, slot_color, sort_order, service_categories!services_category_salon_fkey(id, name, name_en, name_zh, sort_order, is_active)")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .eq("accepts_online_bookings", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });

      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("services")
          .select("id, name, short_name, duration_minutes, booked_slots, price, price_from, is_active, category, slot_color")
          .eq("salon_id", salon.id)
          .eq("is_active", true)
          .order("id", { ascending: true }));
      }
      if (error) throw error;
      return (data || []).map((row) => mapSupabaseService(row, defaultServices));
    },

    async listLaneLayout() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_lanes")
        .select("lane_key, sort_order, salon_staff!inner(staff_key, name, short_name, display_color, sort_order, is_active, accepts_online_bookings)")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .eq("salon_staff.is_active", true)
        .eq("salon_staff.accepts_online_bookings", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapStaffLane);
    },

    async listStaffServices() {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_public_staff_services", {
        p_salon_slug: salon.slug,
      });
      if (error) throw error;
      return (data || []).map((row) => ({
        staffKey: row.staff_key,
        serviceId: row.service_id,
      }));
    },

    async listAppointments(date) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_public_occupied_slots", {
        p_salon_slug: salon.slug,
        p_appointment_date: date,
      });
      if (error) throw error;
      return (data || []).map((row, index) => ({
        id: `occupied-${index}`,
        date,
        occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
        status: "confirmed",
      }));
    },

    async listSchedule(date) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_public_schedule", {
        p_salon_slug: salon.slug,
        p_appointment_date: date,
      });
      if (error) return repository.listAppointments(date);
      return (data || []).map((row, index) => ({
        id: row.record_id || `schedule-${index}`,
        date,
        staffKey: row.record_kind === "time_block" ? null : (row.staff_key || "default"),
        laneKey: row.lane_key || null,
        startMinutes: timeValueToMinutes(row.covered_start),
        endMinutes: timeValueToMinutes(row.covered_end),
        occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes),
        kind: row.record_kind || "appointment",
        status: "confirmed",
      }));
    },

    async createAppointment(appointment) {
      const salon = await salonPromise;
      const { data, error } = await client.functions.invoke("create-booking", {
        body: {
          salon_slug: salon.slug,
          service_id: appointment.serviceId,
          appointment_date: appointment.date,
          start_time: `${formatMinutes(appointment.startMinutes)}:00`,
          gender: appointment.gender,
          name: appointment.name,
          phone: appointment.phone,
          email: appointment.email,
          language: appointment.language,
          staff_key: appointment.staffKey === "any" ? null : appointment.staffKey,
          turnstile_token: appointment.turnstileToken,
        },
      });
      if (error) throw await readFunctionError(error);
      if (data?.error) throw new Error(data.error);
      return {
        bookingId: data?.booking_id,
        emailStatus: data?.email_status || "pending",
      };
    },

    async getDaySettings(date) {
      const salon = await salonPromise;
      const { data: effectiveData, error: effectiveError } = await client.rpc("get_effective_day_settings", {
        p_salon_slug: salon.slug,
        p_setting_date: date,
      });
      if (!effectiveError) {
        const row = Array.isArray(effectiveData) ? effectiveData[0] : effectiveData;
        if (row) return mapSupabaseDaySettings(row);
      } else if (!["42883", "PGRST202"].includes(effectiveError.code)) {
        throw effectiveError;
      }

      const { data, error } = await client
        .from("shop_day_settings")
        .select("setting_date, open_time, close_time, is_blocked_day")
        .eq("salon_id", salon.id)
        .eq("setting_date", date)
        .maybeSingle();
      if (error) throw error;
      return data
        ? normalizeDaySettings(mapSupabaseDaySettings(data))
        : createDefaultDaySettings(date);
    },
  };

  return repository;
}

export async function loadCurrentSalon(client, slug) {
  const { data, error } = await client
    .from("salons")
    .select("id, slug, name, address, phone, timezone, opening_hours, theme_preset, languages")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Der Salon konnte nicht gefunden werden.");
  return data;
}

export function mapSupabaseService(row, defaultServices = []) {
  const fallback = defaultServices.find((service) => service.id === stripSalonPrefix(row.id));
  const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en || "",
    nameZh: row.name_zh || "",
    shortName: row.short_name || row.name,
    duration: row.duration_minutes,
    bookedSlots: row.booked_slots || [],
    price: Number(row.price),
    priceFrom: Boolean(row.price_from),
    slotColor: row.slot_color || "",
    category: row.category || fallback?.category || "care",
    categoryId: row.category_id || category?.id || null,
    categoryName: category?.name || row.category,
    categoryNameEn: category?.name_en || row.category_name_en || "",
    categoryNameZh: category?.name_zh || row.category_name_zh || "",
    categorySortOrder: Number.isFinite(Number(category?.sort_order)) ? Number(category.sort_order) : 999,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : undefined,
    gender: fallback?.gender || row.gender || "unisex",
    isActive: row.is_active,
    acceptsOnline: row.accepts_online_bookings !== false,
  };
}

export function mapSupabaseDaySettings(row) {
  return {
    date: row.setting_date,
    openMinutes: parseTime(row.open_time.slice(0, 5)),
    closeMinutes: parseTime(row.close_time.slice(0, 5)),
    isBlockedDay: row.is_blocked_day,
    holidayName: row.holiday_name || "",
    isPublicHoliday: Boolean(row.is_public_holiday),
    hasManualOverride: Boolean(row.has_manual_override),
  };
}

function mapStaffLane(row) {
  return {
    laneKey: row.lane_key,
    laneSortOrder: Number(row.sort_order || 0),
    staffKey: row.salon_staff?.staff_key || "default",
    staffName: row.salon_staff?.name || row.salon_staff?.short_name || "Mitarbeiter",
    staffShortName: row.salon_staff?.short_name || row.salon_staff?.name || "M",
    staffColor: row.salon_staff?.display_color || "#d7ef57",
    staffSortOrder: Number(row.salon_staff?.sort_order || 0),
  };
}

function stripSalonPrefix(id) {
  return String(id || "").replace(/^(lisa|demo)_/, "");
}

async function readFunctionError(error) {
  let payload = null;
  try {
    const response = error?.context;
    payload = response?.clone ? await response.clone().json() : await response?.json?.();
  } catch {
    payload = null;
  }
  const normalized = new Error(payload?.error || error?.message || "Request failed");
  normalized.code = payload?.code || error?.code || "";
  return normalized;
}
