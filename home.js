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
  render();

  document.querySelectorAll(".case-recording").forEach(recording => {
    const image = recording.querySelector("img");
    const canvas = recording.querySelector("canvas");
    const button = recording.querySelector("button");
    function setPaused(paused) {
      if (!image.complete || !image.naturalWidth) return;
      if (paused) canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.hidden = !paused;
      image.hidden = paused;
      button.setAttribute("aria-pressed", String(paused));
      button.textContent = paused ? "Aufnahme abspielen" : "Aufnahme pausieren";
    }
    button.addEventListener("click", () => setPaused(canvas.hidden));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotionPreference = () => setPaused(reducedMotion.matches);
    image.addEventListener("load", applyMotionPreference, { once: true });
    reducedMotion.addEventListener("change", applyMotionPreference);
    applyMotionPreference();
  });
})();
