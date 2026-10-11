import { formatMinutes } from "../core/time.mjs";

export function createSupabaseAdminRepository({
  client,
  salonSlug,
  appointmentPageSize,
  mapService,
  mapAppointment,
  mapScheduleEntry,
  mapDaySettings,
  mapTimeBlock,
  splitManualScheduleEntries,
  isMissingUnifiedSchedule,
  createDefaultDaySettings,
  cancelledEmailPending,
  onSalonLoaded = () => {},
}) {
  const salonPromise = loadCurrentSalon(client, salonSlug).then((salon) => {
    onSalonLoaded(salon);
    return salon;
  });

  return {
    authSupported: true,
    async getCurrentUser() {
      const { data, error } = await client.auth.getUser();
      return error ? null : data.user;
    },
    onAuthChange(callback) {
      return client.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
    },
    async signIn(email, password, captchaToken) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async listServices() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("services")
        .select("id, name, short_name, duration_minutes, booked_slots, price, price_from, is_active, category, category_id, slot_color, sort_order, service_categories!services_category_salon_fkey(id, name, short_name, sort_order, is_active)")
        .eq("salon_id", salon.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapService);
    },
    async listLaneLayout() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_lanes")
        .select("id, lane_key, label, sort_order, salon_staff!inner(id, staff_key, name, short_name, display_color, sort_order, is_active, accepts_online_bookings)")
        .eq("salon_id", salon.id)
        .eq("is_active", true)
        .eq("salon_staff.is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapStaffLane).sort((left, right) => (
        Number(left.staffSortOrder || 0) - Number(right.staffSortOrder || 0)
        || Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      ));
    },
    async listStaffServices() {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("staff_services")
        .select("service_id, salon_staff!inner(staff_key)")
        .eq("salon_id", salon.id)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((row) => {
        const staff = Array.isArray(row.salon_staff) ? row.salon_staff[0] : row.salon_staff;
        return { staffKey: staff?.staff_key, serviceId: row.service_id };
      }).filter((item) => item.staffKey && item.serviceId);
    },
    async listManualScheduleEntries(date) {
      const salon = await salonPromise;
      let { data, error } = await client
        .from("schedule_entries")
        .select("id, service_id, service_snapshot, entry_source, schedule_date, covered_start, covered_end, occupied_slots, note, staff_lanes!inner(lane_key)")
        .eq("salon_id", salon.id)
        .eq("schedule_date", date)
        .eq("status", "active")
        .neq("entry_source", "online")
        .order("covered_start", { ascending: true });
      if (error?.code === "42703") {
        ({ data, error } = await client
          .from("schedule_entries")
          .select("id, service_id, service_snapshot, entry_source, schedule_date, covered_start, covered_end, occupied_slots, staff_lanes!inner(lane_key)")
          .eq("salon_id", salon.id)
          .eq("schedule_date", date)
          .eq("status", "active")
          .neq("entry_source", "online")
          .order("covered_start", { ascending: true }));
      }
      if (error && isMissingUnifiedSchedule(error)) return null;
      if (error) throw error;
      return (data || []).map(mapScheduleEntry);
    },
    async getDaySnapshot(date) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("get_admin_day_snapshot", {
        p_salon_slug: salon.slug,
        p_schedule_date: date,
      });
      if (error && ["42883", "PGRST202"].includes(error.code)) return null;
      if (error) throw error;
      if (!data?.day_settings?.setting_date) return null;
      const entries = (data.manual_schedule_entries || []).map(mapScheduleEntry);
      return {
        appointments: (data.appointments || []).map(mapAppointment),
        daySettings: mapDaySettings(data.day_settings),
        manualSchedule: { ...splitManualScheduleEntries(entries), isUnified: true },
        timeBlocks: (data.time_blocks || []).map(mapTimeBlock),
      };
    },
    async createManualScheduleEntry(entry) {
      const salon = await salonPromise;
      const { data, error } = await client.rpc("create_admin_schedule_entry", {
        p_salon_id: salon.id,
        p_staff_lane_id: entry.staffLaneId,
        p_schedule_date: entry.date,
        p_start_time: `${formatMinutes(entry.startMinutes)}:00`,
        p_service_id: entry.serviceId || null,
        p_replace_entry_id: entry.replaceEntryId || null,
      });
      if (error) throw error;
      if (data && entry.note != null) {
        const { error: noteError } = await client
          .from("schedule_entries")
          .update({ note: entry.note })
          .eq("id", data);
        if (noteError) throw noteError;
      }
    },
    async deleteManualScheduleEntry(entryId) {
      const { error } = await client.rpc("cancel_admin_schedule_entry", { p_entry_id: entryId });
      if (error) throw error;
    },
    async listAppointments(date) {
      const salon = await salonPromise;
      let { data, error } = await appointmentQuery(client, salon.id, { date, includeLane: true });
      if (error?.code === "42703") {
        ({ data, error } = await appointmentQuery(client, salon.id, { date, includeLane: false }));
      }
      if (error) throw error;
      return (data || []).map(mapAppointment);
    },
    async listAppointmentsFrom(startDate) {
      const salon = await salonPromise;
      const rows = [];
      let offset = 0;
      let includeLane = true;
      while (true) {
        const { data, error } = await appointmentQuery(client, salon.id, {
          startDate,
          includeLane,
          range: [offset, offset + appointmentPageSize - 1],
        });
        if (error?.code === "42703" && includeLane && offset === 0) {
          includeLane = false;
          continue;
        }
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < appointmentPageSize) break;
        offset += appointmentPageSize;
      }
      return rows.map(mapAppointment);
    },
    async cancelAppointment(id) {
      const salon = await salonPromise;
      const { error } = await client
        .from("appointments")
        .update({ status: "cancelled", cancelled_by: "owner", cancelled_at: new Date().toISOString() })
        .eq("id", id)
        .eq("salon_id", salon.id);
      if (error) throw error;
    },
    async getSalonAccess(userId) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("salon_members")
        .select("salon_id, role, staff_id")
        .eq("user_id", userId);
      if (error) throw error;
      const memberships = data || [];
      const admin = memberships.find((membership) => ["admin", "super_admin"].includes(membership.role));
      if (admin) return { allowed: true, role: "admin", staffId: null };
      const membership = memberships.find((item) => item.salon_id === salon.id);
      return {
        allowed: Boolean(membership),
        role: membership?.role || null,
        staffId: membership?.staff_id || null,
      };
    },
    async sendBookingEmail(bookingId) {
      const { data, error } = await client.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId },
      });
      return error || !["sent", "skipped"].includes(data?.email_status)
        ? cancelledEmailPending
        : "";
    },
    async getDaySettings(date) {
      const salon = await salonPromise;
      const { data: effectiveData, error: effectiveError } = await client.rpc("get_effective_day_settings", {
        p_salon_slug: salon.slug,
        p_setting_date: date,
      });
      if (!effectiveError) {
        const row = Array.isArray(effectiveData) ? effectiveData[0] : effectiveData;
        if (row) return mapDaySettings(row);
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
      return data ? mapDaySettings(data) : createDefaultDaySettings(date);
    },
    async listTimeBlocks(date) {
      const salon = await salonPromise;
      const { data, error } = await client
        .from("admin_time_blocks")
        .select("id, staff_id, block_date, start_time, end_time")
        .eq("salon_id", salon.id)
        .eq("block_date", date)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []).map(mapTimeBlock);
    },
    async createTimeBlock(block) {
      const salon = await salonPromise;
      const { error } = await client.rpc("create_admin_time_block", {
        p_salon_id: salon.id,
        p_block_date: block.date,
        p_start_time: `${formatMinutes(block.startMinutes)}:00`,
        p_end_time: `${formatMinutes(block.endMinutes)}:00`,
        p_staff_id: block.staffId || null,
      });
      if (error) throw error;
    },
    async deleteTimeBlock(blockId) {
      const { error } = await client.rpc("delete_admin_time_block", { p_block_id: blockId });
      if (error) throw error;
    },
    async saveDaySettings(settings) {
      const salon = await salonPromise;
      const { error } = await client.from("shop_day_settings").upsert({
        salon_id: salon.id,
        setting_date: settings.date,
        open_time: `${formatMinutes(settings.openMinutes)}:00`,
        close_time: `${formatMinutes(settings.closeMinutes)}:00`,
        is_blocked_day: settings.isBlockedDay,
      }, { onConflict: "salon_id,setting_date" });
      if (error) throw error;
    },
    async setDayBlocked(settings) {
      const salon = await salonPromise;
      const { error } = await client.rpc("set_admin_day_block", {
        p_salon_id: salon.id,
        p_block_date: settings.date,
        p_is_blocked: settings.isBlockedDay,
        p_open_time: `${formatMinutes(settings.openMinutes)}:00`,
        p_close_time: `${formatMinutes(settings.closeMinutes)}:00`,
      });
      if (error) throw error;
    },
  };
}

export async function loadCurrentSalon(client, slug) {
  let { data, error } = await client
    .from("salons")
    .select("id, slug, name, address, phone, timezone, opening_hours, theme_preset, admin_language, languages")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error && /admin_language/i.test(String(error.message || ""))) {
    ({ data, error } = await client
      .from("salons")
      .select("id, slug, name, address, phone, timezone, opening_hours, theme_preset, languages")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle());
  }
  if (error) throw error;
  if (!data) throw new Error(`找不到店铺：${slug}`);
  return data;
}

function mapStaffLane(row) {
  return {
    staffLaneId: row.id,
    laneKey: row.lane_key,
    label: row.label,
    sortOrder: row.sort_order,
    staffKey: row.salon_staff?.staff_key,
    staffId: row.salon_staff?.id,
    staffName: row.salon_staff?.name,
    staffShortName: row.salon_staff?.short_name || row.salon_staff?.name,
    staffColor: row.salon_staff?.display_color || "#d7ef57",
    staffAcceptsOnline: row.salon_staff?.accepts_online_bookings === true,
    staffSortOrder: row.salon_staff?.sort_order,
  };
}

function appointmentQuery(client, salonId, { date, startDate, includeLane, range }) {
  const columns = includeLane
    ? "id, service_id, service_snapshot, appointment_date, start_time, end_time, occupied_slots, lane_key, status, customers:customers!appointments_customer_salon_fkey(name, phone, email, gender)"
    : "id, service_id, service_snapshot, appointment_date, start_time, end_time, occupied_slots, status, customers:customers!appointments_customer_salon_fkey(name, phone, email, gender)";
  let query = client.from("appointments").select(columns).eq("salon_id", salonId);
  if (date) query = query.eq("appointment_date", date);
  if (startDate) query = query.gte("appointment_date", startDate);
  query = query.order("appointment_date", { ascending: true }).order("start_time", { ascending: true });
  if (startDate) query = query.order("id", { ascending: true });
  if (range) query = query.range(range[0], range[1]);
  return query;
}
