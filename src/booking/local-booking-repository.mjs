import { getServiceOccupiedMinutes } from "./scheduling.mjs";

export function createLocalBookingRepository({
  storage,
  cryptoApi,
  localDataRepository,
  keys,
  defaultServices,
  legacyServiceIds,
  slotStep,
  getLaneLayout,
  getServices,
  findAvailableLane,
  createDefaultLaneLayout,
  createDefaultDaySettings,
  normalizeDaySettings,
  normalizeServiceId,
}) {
  const loadAppointments = () => readJson(storage, keys.appointments, []);
  const loadSettings = () => readJson(storage, keys.daySettings, {});
  const loadBlocks = () => readJson(storage, keys.blockedSlots, []);

  const loadServices = () => {
    if (localDataRepository) {
      return localDataRepository.listServices({ includeInactive: true });
    }
    const services = readJson(storage, keys.services, defaultServices);
    if (services.length === 3 && services.every((service) => legacyServiceIds.has(service.id))) {
      storage.setItem(keys.services, JSON.stringify(defaultServices));
      return defaultServices;
    }
    return services.map((service) => {
      const fallback = defaultServices.find((item) => item.id === service.id);
      const prefixedFallback = defaultServices.find((item) => item.id === normalizeServiceId(service.id));
      return {
        ...service,
        category: service.category || fallback?.category || prefixedFallback?.category || "care",
        gender: service.gender || fallback?.gender || prefixedFallback?.gender || "unisex",
      };
    });
  };

  const groupStaffSlots = (date, staffKey, laneKey) => {
    const slots = readJson(storage, keys.flexibleStaffSlots, [])
      .filter((item) => item.date === date && (item.staffKey || "flexible") === staffKey);
    const groups = new Map();
    slots.forEach((item) => {
      if (!item.serviceId && item.isOpen !== false) return;
      const groupStart = item.serviceStartMinutes ?? item.startMinutes;
      const key = item.serviceId ? `${item.serviceId}:${groupStart}` : `blocked:${item.startMinutes}`;
      if (groups.has(key)) return;
      const service = getServices().find((entry) => entry.id === item.serviceId);
      groups.set(key, {
        ...item,
        laneKey,
        startMinutes: groupStart,
        endMinutes: groupStart + (service?.duration || slotStep),
        occupiedMinutes: service ? getServiceOccupiedMinutes(service, groupStart, slotStep) : [item.startMinutes],
        kind: item.serviceId ? "manual" : "blocked",
        status: "confirmed",
      });
    });
    return [...groups.values()];
  };

  const allocateAppointmentLanes = (appointments) => {
    const laneLayout = getLaneLayout();
    const lanes = Object.fromEntries(laneLayout.map((lane) => [lane.laneKey, []]));
    return appointments
      .slice()
      .sort((left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes)
      .map((appointment) => {
        const requested = String(appointment.laneKey || "").toLowerCase();
        const laneKeys = laneLayout.map((lane) => lane.laneKey);
        const laneKey = laneKeys.includes(requested)
          ? requested
          : (laneKeys.find((lane) => !lanes[lane].some((item) => (
            appointment.startMinutes < item.endMinutes && appointment.endMinutes > item.startMinutes
          ))) || laneKeys[laneKeys.length - 1]);
        const staffKey = laneLayout.find((lane) => lane.laneKey === laneKey)?.staffKey || "default";
        const allocated = { ...appointment, laneKey, staffKey };
        lanes[laneKey].push(allocated);
        return allocated;
      });
  };

  const buildSchedule = (date) => {
    const appointments = allocateAppointmentLanes(
      loadAppointments().filter((item) => item.date === date && item.status !== "cancelled"),
    );
    const primary = loadBlocks()
      .filter((item) => item.date === date)
      .map((item) => ({ ...item, laneKey: "a", kind: item.serviceId ? "manual" : "blocked" }));
    return [
      ...appointments,
      ...primary,
      ...groupStaffSlots(date, "overflow", "b"),
      ...groupStaffSlots(date, "flexible", "c"),
    ];
  };

  return {
    requiresTurnstile: false,
    async listServices() {
      return loadServices().filter((service) => service.isActive && service.acceptsOnline !== false);
    },
    async listLaneLayout() {
      const employees = localDataRepository?.listStaff?.()?.filter((employee) => employee.acceptsOnline) || [];
      return employees.length
        ? employees.flatMap((employee) => Array.from({ length: employee.laneCount }, (_, index) => ({
          laneKey: `${employee.staffKey}-${index + 1}`,
          laneSortOrder: index + 1,
          staffKey: employee.staffKey,
          staffName: employee.name,
          staffShortName: employee.shortName,
          staffColor: employee.color,
          staffSortOrder: employee.sortOrder,
        })))
        : createDefaultLaneLayout();
    },
    async listStaffServices() {
      return localDataRepository?.listStaffServices?.() || null;
    },
    async listAppointments(date) {
      return loadAppointments().filter((appointment) => appointment.date === date);
    },
    async listSchedule(date) {
      return buildSchedule(date);
    },
    async createAppointment(appointment) {
      const appointments = loadAppointments();
      const laneKey = findAvailableLane(appointment, buildSchedule(appointment.date));
      if (!laneKey) throw new Error("Slot conflict");
      const id = cryptoApi.randomUUID ? cryptoApi.randomUUID() : String(Date.now());
      const service = loadServices().find((item) => item.id === appointment.serviceId);
      const serviceSnapshot = service ? {
        name: service.name,
        shortName: service.shortName,
        duration: appointment.endMinutes - appointment.startMinutes,
        bookedSlots: [...(service.bookedSlots || [])],
        price: service.price,
        priceFrom: service.priceFrom === true,
        category: service.category,
      } : null;
      appointments.push({ ...appointment, id, laneKey, ...(serviceSnapshot ? { serviceSnapshot } : {}) });
      storage.setItem(keys.appointments, JSON.stringify(appointments));
      return { bookingId: id, emailStatus: "local" };
    },
    async getDaySettings(date) {
      const defaults = createDefaultDaySettings(date);
      const saved = loadSettings()[date];
      return saved ? normalizeDaySettings({ ...defaults, ...saved, hasManualOverride: true }) : defaults;
    },
  };
}

function readJson(storage, key, fallback) {
  const value = storage.getItem(key);
  return value ? JSON.parse(value) : structuredClone(fallback);
}
