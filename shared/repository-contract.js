(function exposeRepositoryContract(global) {
  "use strict";

  const surfaces = Object.freeze({
    booking: Object.freeze([
      "getSalonProfile",
      "getPublicStaff",
      "getPublicServices",
      "getAvailability",
      "createBooking",
    ]),
    admin: Object.freeze([
      "getSessionContext",
      "getDaySnapshot",
      "createManualEntry",
      "cancelManualEntry",
      "cancelOnlineAppointment",
      "createTimeBlock",
      "releaseTimeBlock",
    ]),
    settings: Object.freeze([
      "getSettingsSnapshot",
      "updatePassword",
      "updateSalon",
      "updateWeeklyHours",
      "updateStaff",
      "updateStaffServices",
      "saveCategory",
      "saveService",
      "archiveCategory",
      "archiveService",
      "reorderCatalog",
    ]),
  });

  function assert(repository, surface) {
    const requiredMethods = surfaces[surface];
    if (!requiredMethods) {
      throw new Error(`Unknown repository surface: ${surface}`);
    }

    const missingMethods = requiredMethods.filter(
      (method) => typeof repository?.[method] !== "function",
    );
    if (missingMethods.length > 0) {
      throw new Error(
        `Repository is missing ${surface} methods: ${missingMethods.join(", ")}`,
      );
    }
    return repository;
  }

  global.OpenSlotRepositoryContract = Object.freeze({ surfaces, assert });
})(window);
