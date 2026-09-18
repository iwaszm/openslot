(() => {
  const namespace = "openslot.template.preview.v1";
  window.OPENSLOT_LOCAL_STORAGE_NAMESPACE = namespace;
  window.OPENSLOT_DEMO_LANE_COUNT = 2;

  if (new URLSearchParams(window.location.search).has("reset")) {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(`${namespace}.`))
      .forEach((key) => localStorage.removeItem(key));
  }

  const toDateValue = (date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const nextWorkday = (offset) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    while (date.getDay() === 0) date.setDate(date.getDate() + 1);
    return toDateValue(date);
  };

  const seedVersionKey = `${namespace}.seed-version`;
  if (localStorage.getItem(seedVersionKey) === "1") return;

  localStorage.setItem(`${namespace}.appointments`, JSON.stringify([
    {
      id: "template-online-1",
      date: nextWorkday(1),
      serviceId: "damen_haarschnitt",
      name: "Anna Becker",
      phone: "+49 30 5550101",
      email: "anna@example.test",
      startMinutes: 660,
      endMinutes: 720,
      occupiedMinutes: [660, 690],
      laneKey: "a",
      status: "confirmed"
    },
    {
      id: "template-online-2",
      date: nextWorkday(1),
      serviceId: "haarefarben",
      name: "Mara Hoffmann",
      phone: "+49 30 5550102",
      email: "mara@example.test",
      startMinutes: 780,
      endMinutes: 900,
      occupiedMinutes: [780, 870],
      laneKey: "a",
      status: "confirmed"
    }
  ]));
  localStorage.setItem(`${namespace}.day-settings`, "{}");
  localStorage.setItem(`${namespace}.blocked-slots`, "[]");
  localStorage.setItem(`${namespace}.flexible-staff-slots`, "[]");
  localStorage.setItem(`${namespace}.time-blocks`, "[]");
  localStorage.setItem(seedVersionKey, "1");
})();
