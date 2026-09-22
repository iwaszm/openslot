(() => {
  const language = window.homeLanguage;
  const employees = [{ id: "lisa", name: "Lisa", avatar: "👩🏻" }, { id: "tony", name: "Tony", avatar: "👨🏻" }];
  const services = [
    { id: "women", name: "Damenhaarschnitt", duration: 60, price: 50, slots: 2, color: "#b7d4ef" },
    { id: "men", name: "Herrenhaarschnitt", duration: 30, price: 30, slots: 1, color: "#c8dfb5" },
    { id: "perm", name: "Dauerwelle", duration: 120, price: 120, slots: 4, color: "#f5d39c" },
  ];
  const times = Array.from({ length: 14 }, (_, index) => {
    const minutes = 10 * 60 + index * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  });
  const dates = createDates();
  let appointments = seedAppointments();
  let customerSelection = { employee: "lisa", service: "women", date: dates[0].key, time: null };
  let adminDate = dates[0].key;
  let nextId = 20;

  const bookingForm = document.getElementById("linkedBookingForm");
  const employeeOptions = document.getElementById("demoEmployeeOptions");
  const serviceOptions = document.getElementById("demoServiceOptions");
  const bookingDates = document.getElementById("linkedDemoDates");
  const bookingSlots = document.getElementById("linkedDemoSlots");
  const bookingSummary = document.getElementById("linkedBookingSummary");
  const bookingMessage = document.getElementById("linkedBookingMessage");
  const adminDates = document.getElementById("demoAdminDates");
  const calendar = document.getElementById("demoCalendar");
  const addForm = document.getElementById("demoAdminAdd");
  const addEmployee = document.getElementById("demoAddEmployee");
  const addService = document.getElementById("demoAddService");
  const addTime = document.getElementById("demoAddTime");
  const addMessage = document.getElementById("demoAddMessage");

  function createDates() {
    const berlinDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const result = [];
    for (let offset = 1; result.length < 3; offset += 1) {
      const date = new Date(`${berlinDate}T12:00:00`);
      date.setDate(date.getDate() + offset);
      if (date.getDay() !== 0) result.push({ key: date.toISOString().slice(0, 10), value: date });
    }
    return result;
  }

  function seedAppointments() {
    return [
      { id: 1, date: dates[0].key, employee: "lisa", service: "men", time: "10:00", name: "Noah", source: "online" },
      { id: 2, date: dates[0].key, employee: "tony", service: "perm", time: "10:00", name: "Sofia", source: "phone" },
      { id: 3, date: dates[0].key, employee: "lisa", service: "women", time: "13:00", name: "Mina", source: "walk-in" },
      { id: 4, date: dates[1].key, employee: "tony", service: "women", time: "11:00", name: "Lea", source: "online" },
      { id: 5, date: dates[2].key, employee: "lisa", service: "perm", time: "10:00", name: "Anna", source: "phone" },
      { id: 6, date: dates[0].key, employee: "lisa", service: "women", time: "11:00", name: "Emilie", source: "online" },
      { id: 7, date: dates[0].key, employee: "lisa", service: "men", time: "11:30", name: "Walk-in", source: "manual" },
    ];
  }

  function getService(id) { return services.find(service => service.id === id); }
  function getEmployee(id) { return employees.find(employee => employee.id === id); }
  function dateLabel(key, options = { weekday: "short", day: "2-digit", month: "2-digit" }) { return dates.find(item => item.key === key).value.toLocaleDateString(language.locale, options); }
  function endTime(time, slots) {
    const [hour, minute] = time.split(":").map(Number);
    const end = hour * 60 + minute + slots * 30;
    return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  }
  function isAvailable(date, employee, time, slots, capacity = 1) {
    const start = times.indexOf(time);
    if (start < 0 || start + slots > times.length) return false;
    return Array.from({ length: slots }, (_, offset) => start + offset).every(slotIndex => {
      const occupied = appointments.filter(item => {
        if (item.date !== date || item.employee !== employee) return false;
        const otherStart = times.indexOf(item.time);
        return slotIndex >= otherStart && slotIndex < otherStart + getService(item.service).slots;
      }).length;
      return occupied < capacity;
    });
  }
  function availableTimes(date, employee, service, capacity = 1) { return times.filter(time => isAvailable(date, employee, time, service.slots, capacity)); }

  function choiceButton(text, subtext, selected, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `demo-choice${selected ? " selected" : ""}`;
    button.setAttribute("aria-pressed", String(selected));
    const strong = document.createElement("strong");
    strong.textContent = text;
    button.append(strong);
    if (subtext) { const small = document.createElement("small"); small.textContent = subtext; button.append(small); }
    button.addEventListener("click", handler);
    return button;
  }

  function renderBooking() {
    employeeOptions.replaceChildren(...employees.map(employee => choiceButton(`${employee.avatar} ${employee.name}`, "", customerSelection.employee === employee.id, () => {
      customerSelection.employee = employee.id; customerSelection.time = null; clearBookingMessage(); renderBooking();
    })));
    serviceOptions.replaceChildren(...services.map(service => choiceButton(language.t(service.name), `${service.duration} Min. · ${service.price} €`, customerSelection.service === service.id, () => {
      customerSelection.service = service.id; customerSelection.time = null; clearBookingMessage(); renderBooking();
    })));
    bookingDates.replaceChildren(...dates.map(item => {
      const button = choiceButton(dateLabel(item.key, { weekday: "short", day: "numeric", month: "short" }), "", customerSelection.date === item.key, () => {
        customerSelection.date = item.key; customerSelection.time = null; adminDate = item.key; clearBookingMessage(); renderAll();
      });
      button.classList.add("demo-date-choice");
      return button;
    }));
    const service = getService(customerSelection.service);
    const available = availableTimes(customerSelection.date, customerSelection.employee, service);
    if (!available.includes(customerSelection.time)) customerSelection.time = null;
    bookingSlots.replaceChildren(...times.map(time => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `demo-time${customerSelection.time === time ? " selected" : ""}`;
      button.textContent = time;
      button.disabled = !available.includes(time);
      button.setAttribute("aria-pressed", String(customerSelection.time === time));
      button.addEventListener("click", () => { customerSelection.time = time; clearBookingMessage(); renderBooking(); });
      return button;
    }));
    const employee = getEmployee(customerSelection.employee);
    bookingSummary.textContent = customerSelection.time
      ? `${employee.name} · ${language.t(service.name)} · ${dateLabel(customerSelection.date)} · ${customerSelection.time}–${endTime(customerSelection.time, service.slots)}`
      : `${employee.name} · ${language.t(service.name)} · ${service.duration} Min. · ${service.price} €`;
    bookingForm.querySelector("button[type=submit]").disabled = !customerSelection.time;
  }

  function renderAdminDates() {
    adminDates.replaceChildren(...dates.map(item => choiceButton(dateLabel(item.key, { weekday: "short", day: "numeric", month: "short" }), "", adminDate === item.key, () => { adminDate = item.key; renderAdmin(); })));
  }

  function renderCalendar() {
    calendar.replaceChildren();
    const corner = document.createElement("div"); corner.className = "demo-calendar-corner"; calendar.append(corner);
    employees.forEach(employee => { const heading = document.createElement("strong"); heading.className = "demo-calendar-employee"; heading.textContent = `${employee.avatar} ${employee.name}`; calendar.append(heading); });
    times.forEach((time, row) => {
      const label = document.createElement("span"); label.className = "demo-calendar-time"; label.style.gridRow = String(row + 2); label.textContent = time; calendar.append(label);
      employees.forEach((employee, column) => { const cell = document.createElement("span"); cell.className = "demo-calendar-cell"; cell.style.gridRow = String(row + 2); cell.style.gridColumn = String(column + 2); calendar.append(cell); });
    });
    const dayAppointments = appointments.filter(item => item.date === adminDate).sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
    const laneEnds = Object.fromEntries(employees.map(employee => [employee.id, [-1, -1]]));
    dayAppointments.forEach(item => {
      const service = getService(item.service);
      const start = times.indexOf(item.time);
      const end = start + service.slots;
      const hasOverlap = dayAppointments.some(other => {
        if (other.id === item.id || other.employee !== item.employee) return false;
        const otherStart = times.indexOf(other.time);
        return start < otherStart + getService(other.service).slots && otherStart < end;
      });
      const lane = laneEnds[item.employee][0] <= start ? 0 : 1;
      laneEnds[item.employee][lane] = end;
      const block = document.createElement("div");
      block.className = `demo-calendar-event ${hasOverlap ? `lane-${lane}` : "lane-full"} ${item.source === "online" ? "online" : "offline"}`;
      block.style.gridColumn = String(employees.findIndex(employee => employee.id === item.employee) + 2);
      block.style.gridRow = `${start + 2} / span ${service.slots}`;
      block.style.setProperty("--event-color", service.color);
      const strong = document.createElement("strong"); strong.textContent = `${item.time} · ${item.name || "Walk-in"}`;
      const span = document.createElement("span"); span.textContent = language.t(service.name);
      const menu = document.createElement("details"); menu.className = "demo-event-menu";
      const summary = document.createElement("summary");
      summary.setAttribute("aria-label", `${item.name || "Walk-in"}: ${language.t("Aktionen")}`);
      summary.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = language.t("Löschen");
      remove.addEventListener("click", event => { event.stopPropagation(); appointments = appointments.filter(appointment => appointment.id !== item.id); renderAll(); });
      menu.append(summary, remove);
      block.append(strong, span, menu); calendar.append(block);
    });
  }

  function updateAdminTimeOptions() {
    const service = getService(addService.value || services[0].id);
    const available = availableTimes(adminDate, addEmployee.value || employees[0].id, service, 2);
    addTime.replaceChildren(...available.map(time => new Option(time, time)));
    if (!available.length) addTime.append(new Option(language.t("Keine Zeit frei"), ""));
  }
  function renderAdmin() { renderAdminDates(); renderCalendar(); updateAdminTimeOptions(); }
  function renderAll() { renderBooking(); renderAdmin(); }
  function clearBookingMessage() { bookingMessage.textContent = ""; bookingMessage.className = "linked-demo-message"; }

  bookingForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!customerSelection.time) return;
    const service = getService(customerSelection.service);
    if (!isAvailable(customerSelection.date, customerSelection.employee, customerSelection.time, service.slots)) {
      bookingMessage.textContent = language.t("Dieser Termin ist gerade nicht mehr frei. Bitte wähle eine andere Uhrzeit."); bookingMessage.className = "linked-demo-message error"; renderAll(); return;
    }
    appointments.push({ id: nextId++, ...customerSelection, name: document.getElementById("demoCustomerName").value.trim() || language.t("Demo-Gast"), source: "online" });
    adminDate = customerSelection.date;
    bookingMessage.textContent = language.t("Termin bestätigt – rechts ist er bereits im Tagesplan sichtbar.");
    bookingMessage.className = "linked-demo-message success";
    customerSelection.time = null;
    renderAll();
    const admin = document.querySelector(".demo-admin"); admin.classList.remove("demo-sync-pulse"); requestAnimationFrame(() => admin.classList.add("demo-sync-pulse"));
  });

  document.getElementById("demoAddToggle").addEventListener("click", event => {
    const open = addForm.hidden; addForm.hidden = !open; event.currentTarget.setAttribute("aria-expanded", String(open)); addMessage.textContent = ""; if (open) addEmployee.focus();
  });
  document.getElementById("demoAddCancel").addEventListener("click", () => { addForm.hidden = true; document.getElementById("demoAddToggle").setAttribute("aria-expanded", "false"); });
  addEmployee.addEventListener("change", updateAdminTimeOptions);
  addService.addEventListener("change", updateAdminTimeOptions);
  addForm.addEventListener("submit", event => {
    event.preventDefault();
    const selectedService = getService(addService.value);
    if (!addTime.value || !isAvailable(adminDate, addEmployee.value, addTime.value, selectedService.slots, 2)) { addMessage.textContent = language.t("Für diese Auswahl ist keine Zeit frei."); updateAdminTimeOptions(); return; }
    appointments.push({ id: nextId++, date: adminDate, employee: addEmployee.value, service: addService.value, time: addTime.value, name: document.getElementById("demoAddName").value.trim() || "Walk-in", source: "manual" });
    addForm.reset(); addMessage.textContent = ""; addForm.hidden = true; document.getElementById("demoAddToggle").setAttribute("aria-expanded", "false"); renderAll();
  });
  document.getElementById("demoResetAll").addEventListener("click", () => {
    appointments = seedAppointments();
    customerSelection = { employee: "lisa", service: "women", date: dates[0].key, time: null };
    adminDate = dates[0].key;
    nextId = 20;
    document.getElementById("demoCustomerName").value = "";
    addForm.reset(); addForm.hidden = true; addMessage.textContent = ""; clearBookingMessage();
    document.getElementById("demoAddToggle").setAttribute("aria-expanded", "false");
    renderAll();
  });
  addEmployee.replaceChildren(...employees.map(item => new Option(`${item.avatar} ${item.name}`, item.id)));
  function renderServiceOptions() { addService.replaceChildren(...services.map(item => new Option(`${language.t(item.name)} · ${item.duration} Min.`, item.id))); }
  renderServiceOptions();
  window.addEventListener("home-language-change", () => { renderServiceOptions(); renderAll(); });
  renderAll();
})();
