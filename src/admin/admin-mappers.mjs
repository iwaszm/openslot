import { dateToMinutes, parseTime, timeValueToMinutes } from "../core/time.mjs";

export function createAdminMappers({ defaultServices, legacyServiceMeta, normalizeServiceSnapshot }) {
  const stripSalonPrefix = (id) => String(id || "").replace(/^(lisa|demo)_/, "");
  const fromService = (row) => {
    const baseId = stripSalonPrefix(row.id);
    const fallback = defaultServices.find((service) => service.id === baseId);
    const legacy = legacyServiceMeta.get(baseId);
    const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
    return {
      id: row.id, name: row.name, nameEn: row.name_en || "", nameZh: row.name_zh || "", shortName: row.short_name || row.name,
      duration: row.duration_minutes, bookedSlots: row.booked_slots || [], price: Number(row.price),
      priceFrom: Boolean(row.price_from), slotColor: row.slot_color || "",
      category: row.category || fallback?.category || legacy?.category || "care",
      categoryId: row.category_id || category?.id || null,
      categoryName: category?.name || row.category,
      categoryShortName: category?.short_name || category?.name || row.category,
      categorySortOrder: Number.isFinite(Number(category?.sort_order)) ? Number(category.sort_order) : 999,
      sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : undefined,
      gender: fallback?.gender || legacy?.gender || row.gender || "unisex", isActive: row.is_active,
    };
  };
  const fromAppointment = (row) => {
    const customer = row.customers || {};
    return {
      id: row.id, date: row.appointment_date, serviceId: row.service_id, gender: customer.gender || "male",
      name: customer.name || "", phone: customer.phone || "", email: customer.email || "",
      startMinutes: dateToMinutes(row.start_time), endMinutes: dateToMinutes(row.end_time),
      occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes), laneKey: row.lane_key || null,
      status: row.status, serviceSnapshot: normalizeServiceSnapshot(row.service_snapshot),
    };
  };
  const fromScheduleEntry = (row) => {
    const lane = Array.isArray(row.staff_lanes) ? row.staff_lanes[0] : row.staff_lanes;
    const startMinutes = parseTime(String(row.covered_start).slice(0, 5));
    return {
      id: row.id, date: row.schedule_date, startMinutes,
      endMinutes: parseTime(String(row.covered_end).slice(0, 5)),
      occupiedMinutes: (row.occupied_slots || []).map(timeValueToMinutes), serviceId: row.service_id || null,
      serviceStartMinutes: startMinutes, laneKey: lane?.lane_key || null, isOpen: row.entry_source !== "block",
      entrySource: row.entry_source, note: row.note || "", serviceSnapshot: normalizeServiceSnapshot(row.service_snapshot),
    };
  };
  const fromDaySettings = (row) => ({
    date: row.setting_date, openMinutes: parseTime(row.open_time.slice(0, 5)),
    closeMinutes: parseTime(row.close_time.slice(0, 5)), isBlockedDay: row.is_blocked_day,
    holidayName: row.holiday_name || "", isPublicHoliday: Boolean(row.is_public_holiday),
    hasManualOverride: Boolean(row.has_manual_override),
  });
  const fromTimeBlock = (row) => ({
    id: row.id, staffId: row.staff_id || null, date: row.block_date,
    startMinutes: parseTime(String(row.start_time).slice(0, 5)),
    endMinutes: parseTime(String(row.end_time).slice(0, 5)),
  });
  return Object.freeze({
    fromAppointment, fromDaySettings, fromScheduleEntry, fromService, fromTimeBlock,
    isMissingUnifiedSchedule: (error) => ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code),
    stripSalonPrefix,
  });
}
