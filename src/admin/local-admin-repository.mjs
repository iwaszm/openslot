export function createLocalAdminRepository(options) {
  const {
    storage,
    cryptoApi,
    keys,
    isLaneDemo,
    loadServices,
    loadLaneLayout,
    loadStaffServices,
    loadAppointments,
    loadDaySettings,
    saveDaySettings: persistDaySettings,
    loadTimeBlocks,
    saveTimeBlocks,
    previewTimeBlocksByDate,
    loadPreviewSchedule,
    loadBlockedSlots,
    saveBlockedSlots,
    loadStaffSlots,
    saveStaffSlot: persistStaffSlot,
    deleteStaffSlot: removeStaffSlot,
    getSelectedDate,
    getActiveAppointments,
    getManualGroups,
    getOccupiedRanges,
    createDefaultDaySettings,
  } = options;

  const createId = () => cryptoApi.randomUUID?.() || String(Date.now());
  const hasOccupiedSlots = () => [
    ...getActiveAppointments(),
    ...getManualGroups().filter((item) => item.serviceId),
  ].some((item) => getOccupiedRanges(item).length > 0);

  const repository = {
    authSupported: false,
    async getAccessToken() { return ""; },
    async getCurrentUser() { return { email: "local-demo" }; },
    onAuthChange() {},
    async signIn() {},
    async signOut() {},
    async listServices() { return loadServices(); },
    async listLaneLayout() { return loadLaneLayout(); },
    async listStaffServices() { return loadStaffServices(); },
    async listManualScheduleEntries() { return null; },
    async getDaySnapshot() { return null; },
    async createManualScheduleEntry() { throw new Error("Unified schedule entries are unavailable in local mode"); },
    async deleteManualScheduleEntry() { throw new Error("Unified schedule entries are unavailable in local mode"); },
    async listAppointments(date) {
      const appointments = isLaneDemo() ? [] : loadAppointments();
      return appointments.filter((appointment) => appointment.date === date);
    },
    async listAppointmentsFrom(startDate) {
      return loadAppointments().filter((appointment) => appointment.date >= startDate);
    },
    async cancelAppointment(id) {
      storage.setItem(keys.appointments, JSON.stringify(loadAppointments().map((appointment) => (
        appointment.id === id ? { ...appointment, status: "cancelled", cancelledBy: "owner" } : appointment
      ))));
    },
    async sendBookingEmail() {
      return "预约已取消。本地演示版不会发送邮件。";
    },
    async getDaySettings(date) {
      const defaults = createDefaultDaySettings(date);
      const saved = loadDaySettings()[date];
      return saved ? { ...defaults, ...saved, hasManualOverride: true } : defaults;
    },
    async listTimeBlocks(date) {
      if (isLaneDemo()) return previewTimeBlocksByDate.get(date) || [];
      return loadTimeBlocks().filter((block) => block.date === date);
    },
    async createTimeBlock(block) {
      const occupiedStarts = [
        ...getActiveAppointments(),
        ...getManualGroups().filter((item) => item.serviceId),
      ].flatMap((item) => getOccupiedRanges(item).map((range) => range.startMinutes));
      if (occupiedStarts.some((minutes) => minutes >= block.startMinutes && minutes < block.endMinutes)) {
        throw new Error("OCCUPIED_SLOTS_PRESENT");
      }
      const nextBlock = { ...block, id: createId() };
      if (isLaneDemo()) {
        const blocks = previewTimeBlocksByDate.get(block.date) || [];
        blocks.push(nextBlock);
        previewTimeBlocksByDate.set(block.date, blocks);
        return;
      }
      const blocks = loadTimeBlocks();
      blocks.push(nextBlock);
      saveTimeBlocks(blocks);
    },
    async deleteTimeBlock(blockId) {
      if (isLaneDemo()) {
        for (const [date, blocks] of previewTimeBlocksByDate.entries()) {
          previewTimeBlocksByDate.set(date, blocks.filter((block) => block.id !== blockId));
        }
        return;
      }
      saveTimeBlocks(loadTimeBlocks().filter((block) => block.id !== blockId));
    },
    async listBlockedSlots(date) {
      if (isLaneDemo()) return (await loadPreviewSchedule(date)).laneA;
      return loadBlockedSlots().filter((block) => block.date === date);
    },
    async listStaffSlots(date, staffKey) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(date);
        return staffKey === "overflow" ? schedule.laneB : schedule.laneC;
      }
      return loadStaffSlots(date, staffKey);
    },
    async saveStaffSlot(slot, staffKey) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(slot.date);
        const lane = staffKey === "overflow" ? schedule.laneB : schedule.laneC;
        const existingIndex = lane.findIndex((item) => item.startMinutes === slot.startMinutes);
        const nextSlot = { ...slot, staffKey };
        if (existingIndex >= 0) lane.splice(existingIndex, 1, nextSlot);
        else lane.push(nextSlot);
        return;
      }
      persistStaffSlot(slot, staffKey);
    },
    async deleteStaffSlot(date, staffKey, startMinutes) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(date);
        const lane = staffKey === "overflow" ? schedule.laneB : schedule.laneC;
        const existingIndex = lane.findIndex((item) => item.startMinutes === startMinutes);
        if (existingIndex >= 0) lane.splice(existingIndex, 1);
        return;
      }
      removeStaffSlot(date, staffKey, startMinutes);
    },
    async createBlockedSlot(block) {
      const nextBlock = { ...block, id: createId() };
      if (isLaneDemo()) {
        (await loadPreviewSchedule(block.date)).laneA.push(nextBlock);
        return;
      }
      const blocks = loadBlockedSlots();
      blocks.push(nextBlock);
      saveBlockedSlots(blocks);
    },
    async deleteBlockedSlot(blockId) {
      if (isLaneDemo()) {
        const schedule = await loadPreviewSchedule(getSelectedDate());
        const existingIndex = schedule.laneA.findIndex((block) => block.id === blockId);
        if (existingIndex >= 0) schedule.laneA.splice(existingIndex, 1);
        return;
      }
      saveBlockedSlots(loadBlockedSlots().filter((block) => block.id !== blockId));
    },
    async saveDaySettings(settings) {
      const values = loadDaySettings();
      values[settings.date] = settings;
      persistDaySettings(values);
    },
    async setDayBlocked(settings) {
      if (settings.isBlockedDay && hasOccupiedSlots()) throw new Error("OCCUPIED_SLOTS_PRESENT");
      await repository.saveDaySettings(settings);
    },
  };

  return repository;
}
