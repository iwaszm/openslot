(() => {
  const dateContainer = document.getElementById("demoDates");
  const slotsContainer = document.getElementById("demoSlots");
  const summary = document.getElementById("demoSummary");
  const services = [...document.querySelectorAll("[data-service]")];
  const dates = [];
  const todayInBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const currentDate = new Date(`${todayInBerlin}T12:00:00`);
  for (let offset = 1; dates.length < 5; offset += 1) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + offset);
    if (date.getDay() !== 0) dates.push(date);
  }
  let selectedDate = 0;
  let selectedService = services[0];
  let selectedTime = "10:00";
  const schedules = [
    ["10:00", "11:30", "14:00", "16:30"],
    ["09:00", "10:30", "13:00", "15:00"],
    ["09:30", "11:00", "14:30", "17:00"],
    ["10:00", "12:00", "15:30", "17:30"],
    ["09:00", "11:30", "13:30", "16:00"],
  ];

  function describeSelection() {
    return `${selectedService.dataset.service} · ${dates[selectedDate].toLocaleDateString("de-DE", { day: "numeric", month: "long" })} · ${selectedTime} Uhr`;
  }

  function render() {
    const selected = dates[selectedDate];
    document.getElementById("demoMonth").textContent = selected.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    dateContainer.replaceChildren(...dates.map((date, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `date-button${index === selectedDate ? " selected" : ""}`;
      button.setAttribute("aria-pressed", String(index === selectedDate));
      button.setAttribute("aria-label", date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
      button.append(date.toLocaleDateString("de-DE", { weekday: "short" }));
      const number = document.createElement("strong");
      number.textContent = date.getDate();
      button.append(number);
      button.addEventListener("click", () => {
        selectedDate = index;
        selectedTime = schedules[index][0];
        render();
        dateContainer.children[index].focus({ preventScroll: true });
      });
      return button;
    }));
    slotsContainer.replaceChildren(...schedules[selectedDate].map((time, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slot-button${time === selectedTime ? " selected" : ""}`;
      button.textContent = time;
      button.setAttribute("aria-pressed", String(time === selectedTime));
      button.addEventListener("click", () => {
        selectedTime = time;
        render();
        slotsContainer.children[index].focus({ preventScroll: true });
      });
      return button;
    }));
    services.forEach(button => {
      button.classList.toggle("selected", button === selectedService);
      button.setAttribute("aria-pressed", String(button === selectedService));
    });
    summary.textContent = describeSelection();
  }

  services.forEach(button => button.addEventListener("click", () => {
    selectedService = button;
    render();
  }));
  document.getElementById("demoConfirm").addEventListener("click", () => {
    const existing = appointments.find(item => item.fromBooking && item.day === selectedDate && item.time === selectedTime && !item.cancelled);
    if (!existing) appointments.push({ id: nextId++, day: selectedDate, time: selectedTime, name: "Demo-Gast", service: selectedService.dataset.service, duration: Number(selectedService.dataset.duration), cancelled: false, fromBooking: true });
    managementDate.value = String(selectedDate);
    managementStatus.value = "active";
    renderManagement();
    document.getElementById("demoConfirmedDetails").textContent = describeSelection();
    document.getElementById("demoForm").hidden = true;
    document.getElementById("demoSuccess").hidden = false;
    document.getElementById("demoSuccess").focus({ preventScroll: true });
  });
  document.getElementById("demoReset").addEventListener("click", () => {
    selectedDate = 0;
    selectedService = services[0];
    selectedTime = schedules[0][0];
    render();
    document.getElementById("demoSuccess").hidden = true;
    document.getElementById("demoForm").hidden = false;
    services[0].focus({ preventScroll: true });
  });
  const managementDate = document.getElementById("managementDate");
  const managementStatus = document.getElementById("managementStatus");
  const managementList = document.getElementById("managementList");
  const dialog = document.getElementById("appointmentDialog");
  const cancelButton = document.getElementById("appointmentCancel");
  let nextId = 100;
  let openedId = null;
  const seedAppointments = () => dates.slice(0, 4).flatMap((date, day) => [
    { id: day * 2, day, time: "09:00", name: "Alex M.", service: "Haarschnitt", duration: 30, cancelled: false },
    { id: day * 2 + 1, day, time: "13:00", name: "Sam K.", service: "Styling", duration: 60, cancelled: false },
  ]);
  let appointments = seedAppointments();
  dates.forEach((date, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });
    managementDate.append(option);
  });
  const managementLink = document.createElement("a");
  managementLink.className = "reset-button management-link";
  managementLink.href = "#verwaltung-demo";
  managementLink.textContent = "In der Verwaltung ansehen";
  document.getElementById("demoSuccess").append(managementLink);

  function renderManagement() {
    const dayItems = appointments.filter(item => item.day === Number(managementDate.value));
    const visible = dayItems.filter(item => managementStatus.value === "all" || item.cancelled === (managementStatus.value === "cancelled"))
      .sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
    const active = dayItems.filter(item => !item.cancelled).length;
    document.getElementById("managementCount").textContent = `${active} bestätigt · ${dayItems.length - active} storniert`;
    managementList.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "management-empty";
      empty.textContent = "Keine Termine für diese Auswahl.";
      managementList.append(empty);
    }
    visible.forEach(item => {
      const row = document.createElement("div");
      row.className = "appointment-row";
      const time = document.createElement("strong");
      time.textContent = item.time;
      const customer = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.name;
      const service = document.createElement("span");
      service.textContent = `${item.service} · ${item.duration} Min.`;
      customer.append(name, service);
      const status = document.createElement("span");
      status.className = `appointment-status${item.cancelled ? " cancelled" : ""}`;
      status.textContent = item.cancelled ? "Storniert" : "Bestätigt";
      const details = document.createElement("button");
      details.type = "button";
      details.className = "reset-button";
      details.textContent = "Details";
      details.setAttribute("aria-label", `Details: ${item.name}, ${item.time} Uhr`);
      details.addEventListener("click", () => {
        openedId = item.id;
        document.getElementById("appointmentDetails").textContent = `${item.name} · ${item.service} · ${item.duration} Min. · ${dates[item.day].toLocaleDateString("de-DE")} · ${item.time} Uhr`;
        document.getElementById("appointmentPrompt").textContent = item.cancelled ? "Dieser Demo-Termin ist storniert." : "Diesen Demo-Termin stornieren? Es wird keine E-Mail versendet.";
        cancelButton.hidden = item.cancelled;
        dialog.showModal();
        document.getElementById("appointmentClose").focus();
      });
      row.append(time, customer, status, details);
      managementList.append(row);
    });
  }
  [managementDate, managementStatus].forEach(control => control.addEventListener("change", () => {
    document.getElementById("managementMessage").textContent = "";
    renderManagement();
  }));
  document.getElementById("appointmentClose").addEventListener("click", () => dialog.close());
  cancelButton.addEventListener("click", () => {
    const item = appointments.find(item => item.id === openedId);
    if (!item || item.cancelled) return;
    item.cancelled = true;
    dialog.close();
    renderManagement();
    document.getElementById("managementMessage").textContent = `Demo-Termin von ${item.name} storniert. Es wurde keine E-Mail versendet.`;
    managementStatus.focus({ preventScroll: true });
  });
  document.getElementById("managementReset").addEventListener("click", () => {
    appointments = seedAppointments();
    managementDate.value = "0";
    managementStatus.value = "active";
    document.getElementById("managementMessage").textContent = "Beispieltermine wiederhergestellt.";
    renderManagement();
  });
  renderManagement();
  render();
})();
