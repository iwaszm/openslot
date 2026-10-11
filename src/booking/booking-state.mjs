export function createBookingState({ daySettings, laneLayout, services, requireServiceSelection }) {
  const first = services[0];
  return {
    appointments: [], scheduleRecords: [], daySettings, repository: null, services,
    salon: null, laneLayout, staffServiceKeys: null, dateOptions: [],
    selectedServiceId: requireServiceSelection ? "" : first?.id || "",
    selectedGender: requireServiceSelection ? "" : first?.gender || "",
    selectedSlot: "", selectedStaffKey: "any", storageStatusKey: "common.detecting", formMessageRenderer: null,
  };
}
