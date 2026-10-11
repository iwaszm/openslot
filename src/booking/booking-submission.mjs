export function createBookingSubmissionController({ elements, state, dependencies }) {
  const d = dependencies;
  async function submit(event) {
    event.preventDefault();
    const invalid = d.validateCustomerFields();
    if (invalid) { invalid.reportValidity(); return; }
    if (!state.selectedSlot) {
      const service = d.getSelectedService();
      d.setMessage(() => d.getNoSlotMessage(service ? d.buildSlots(elements.date.value, service) : []));
      return;
    }
    const values = new FormData(elements.form);
    const service = d.getSelectedService();
    const startMinutes = d.parseTime(state.selectedSlot);
    const appointment = {
      date: elements.date.value, serviceId: service.id, gender: values.get("gender"),
      name: String(values.get("name")).trim(), phone: String(values.get("phone")).trim(),
      email: String(values.get("email")).trim(), startMinutes, endMinutes: startMinutes + service.duration,
      occupiedMinutes: d.getOccupiedMinutes(service, startMinutes), staffKey: state.selectedStaffKey, status: "confirmed",
    };
    elements.form.dispatchEvent(new CustomEvent("openslot:booking-check-start"));
    try {
      await d.refreshDay({ shouldRender: false });
      if (d.validateSlot(appointment)) {
        d.setMessage(() => d.validateSlot(appointment));
        state.selectedSlot = "";
        d.renderSlots();
        return;
      }
      if (state.repository.requiresTurnstile) {
        appointment.turnstileToken = d.turnstile.getToken();
        if (!appointment.turnstileToken) { d.updateSubmit(); return; }
      }
      const result = await state.repository.createAppointment(appointment);
      const emailStatus = result?.emailStatus || "pending";
      const selectedDate = elements.date.value;
      elements.form.reset();
      elements.date.value = selectedDate;
      state.selectedSlot = "";
      state.selectedServiceId = d.requireServiceSelection() ? "" : d.activeServices()[0]?.id || "";
      state.selectedGender = d.requireServiceSelection() ? "" : "male";
      elements.gender.value = state.selectedGender;
      d.turnstile.reset();
      const mail = emailStatus === "sent" ? "" : emailStatus === "local" ? d.t("customer.localNoEmail") : d.t("customer.emailDeliveryFailed");
      d.renderResult(emailStatus);
      d.setMessage(mail || "");
      await d.refreshDay();
      d.renderServices();
    } catch (error) {
      d.turnstile.reset();
      d.setMessage(() => d.formatError(error));
      await d.refreshDay();
    }
  }
  return Object.freeze({ submit });
}
