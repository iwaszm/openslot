(async () => {
  const runtime = window.OPENSLOT_RUNTIME;
  if (runtime?.environment !== "template" || runtime?.dataSource !== "local") {
    throw new Error("Template admin may only run through the isolated local runtime.");
  }
  const t = (key, values) => window.OpenSlotI18n?.t(key, values) || key;
  const locale = ({ zh: "zh-CN", en: "en-GB", de: "de-DE" })[window.OpenSlotI18n?.language] || "de-DE";
  document.getElementById("availabilityToggle")?.setAttribute("aria-label", t("admin.manageAvailability"));
  document.getElementById("availabilityToggle")?.setAttribute("title", t("admin.manageAvailability"));
  const namespace = runtime.namespace;
  const auth = window.OpenSlotLocalAuthRepository;
  const onlineKey = `${namespace}.appointments`;
  const manualKey = `${namespace}.preview-manual-appointments`;
  const settingsKey = `${namespace}.day-settings`;
  const staffDayBlocksKey = `${namespace}.staff-day-blocks`;
  const timeBlocksKey = `${namespace}.time-blocks`;
  const seedKey = `${namespace}.preview-manual-seed`;
  const localRepository = window.OpenSlotLocalRepository;
  let staffRecords = localRepository.listStaff();
  let staff = staffRecords.map((employee) => employee.shortName);
  let categories = Object.fromEntries(localRepository.listCategories().map((category) => [category.id, category.shortName || category.name]));
  let services = localRepository.listServices();
  let staffServices = localRepository.listStaffServices();
  const applyShopProfile = () => { const profile = localRepository.getShopProfile(); document.getElementById("adminShopName").textContent = profile.name; document.title = `${profile.name} · Tagesplan`; document.documentElement.dataset.shopTheme = profile.themePreset; document.documentElement.style.setProperty("--shop-accent", profile.themeColor); };
  applyShopProfile();
  let open = 10 * 60;
  let close = 18 * 60;
  const slotStep = 30;
  const busyRowHeight = 62;
  const emptyRowHeight = 34;
  const board = document.getElementById("scheduleBoard");
  const bookingDialog = document.getElementById("bookingDialog");
  const detailDialog = document.getElementById("detailDialog");
  const confirmDialog = document.getElementById("confirmDialog");
  const toast = document.getElementById("actionToast");
  const form = document.getElementById("manualBookingForm");
  let toastTimeout;
  const pad = (value) => String(value).padStart(2, "0");
  const dateValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = (value) => new Date(`${value}T12:00:00`);
  const time = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const readArray = (key) => { try { const data = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(data) ? data : []; } catch { return []; } };
  const saveArray = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let selectedDate = dateValue(new Date());
  let visibleStartDate = selectedDate;
  let pendingConfirm = null;
  let showAllStaff = true;
  let selectedVisibleStaffKeys = new Set();
  let session = await auth.getSession();
  const isOwner = () => session?.role === "owner" || session?.role === "admin";
  const sessionStaffIndex = () => staffRecords.findIndex((employee) => employee.staffKey === session?.staffKey);
  const canManageStaff = (staffIndex) => isOwner() || (session?.role === "staff" && Number(staffIndex) === sessionStaffIndex());
  const mutationStaffIndex = () => isOwner() ? selectedStaffIndex() : sessionStaffIndex();
  function denyMutation() {
    showToast("Nur der zuständige Mitarbeiter oder der Owner darf diesen Bereich ändern.", "error");
  }
  function applySession() {
    const loggedIn = Boolean(session);
    document.getElementById("previewLoginForm").hidden = loggedIn;
    document.getElementById("previewSession").hidden = !loggedIn;
    document.getElementById("previewMain").hidden = !loggedIn;
    if (!loggedIn) return;
    document.getElementById("previewSessionLabel").textContent = session.email;
    document.getElementById("settingsLink").hidden = false;
    const availabilityStaff = document.getElementById("availabilityStaff");
    availabilityStaff.value = isOwner() ? "all" : String(Math.max(0, sessionStaffIndex()));
    availabilityStaff.disabled = !isOwner();
    render();
  }

  if (localStorage.getItem(seedKey) !== "1") {
    const sampleDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() === 0) d.setDate(d.getDate() + 1); return dateValue(d); })();
    saveArray(manualKey, [
      { id: "preview-manual-1", date: sampleDate, staffIndex: 0, serviceId: "pflegen", startMinutes: 690, endMinutes: 750, note: "Beratung vor Ort" },
      { id: "preview-manual-2", date: sampleDate, staffIndex: 1, serviceId: "herren_haarschnitt", startMinutes: 750, endMinutes: 780, note: "Stammkunde" },
      { id: "preview-manual-3", date: sampleDate, staffIndex: 1, serviceId: "damen_haarschnitt", startMinutes: 780, endMinutes: 840, note: "Farbberatung" }
    ]);
    localStorage.setItem(seedKey, "1");
  }
  const today = dateValue(new Date());
  if (localStorage.getItem(`${namespace}.preview-today-seed-${today}`) !== "1") {
    const online = readArray(onlineKey);
    if (!online.some((item) => item.date === today && item.id.startsWith("preview-today-online"))) {
      online.push(
        { id: `preview-today-online-1-${today}`, date: today, staffIndex: 0, laneKey: "a", serviceId: "damen_haarschnitt", name: "Nora Weber", phone: "+49 30 5550103", startMinutes: 660, endMinutes: 720, occupiedMinutes: [660, 690], status: "confirmed" },
        { id: `preview-today-online-2-${today}`, date: today, staffIndex: 0, laneKey: "a", serviceId: "haarefarben", name: "Sofia Brandt", phone: "+49 30 5550104", startMinutes: 870, endMinutes: 990, occupiedMinutes: [870, 960], status: "confirmed" }
      );
    }
    online.forEach((item) => {
      if (item.date !== today) return;
      if (item.id.startsWith("preview-today-online-1")) {
        item.phone ||= "+49 30 5550103";
        item.occupiedMinutes ||= [660, 690];
      }
      if (item.id.startsWith("preview-today-online-2")) {
        item.phone ||= "+49 30 5550104";
        item.occupiedMinutes ||= [870, 960];
      }
    });
    saveArray(onlineKey, online);
    const manual = readArray(manualKey);
    if (!manual.some((item) => item.date === today && item.id.startsWith("preview-today-manual"))) manual.push(
      { id: `preview-today-manual-1-${today}`, date: today, staffIndex: 0, serviceId: "pflegen", startMinutes: 690, endMinutes: 750, note: "Beratung vor Ort" },
      { id: `preview-today-manual-2-${today}`, date: today, staffIndex: 1, serviceId: "herren_haarschnitt", startMinutes: 780, endMinutes: 810, note: "Stammkunde" }
    );
    saveArray(manualKey, manual);
    localStorage.setItem(`${namespace}.preview-today-seed-${today}`, "1");
  }

  const findService = (id) => services.find((item) => item.id === id || item.id?.endsWith(`_${id}`));
  const createServiceSnapshot = (service, item) => service ? {
    name: service.name,
    shortName: service.shortName,
    duration: Number(item?.endMinutes) - Number(item?.startMinutes) || service.duration,
    bookedSlots: [...(service.bookedSlots || [])],
    price: service.price,
    priceFrom: service.priceFrom === true,
    category: service.category,
    color: service.color,
  } : null;
  const serviceForItem = (item) => {
    const current = findService(item.serviceId);
    return item.serviceSnapshot ? { ...current, ...item.serviceSnapshot, id: item.serviceId } : current;
  };
  const backfillAppointmentSnapshots = () => {
    [onlineKey, manualKey].forEach((key) => {
      let changed = false;
      const records = readArray(key).map((item) => {
        if (item.serviceSnapshot) return item;
        const service = findService(item.serviceId);
        if (!service) return item;
        changed = true;
        const occupiedMinutes = Array.isArray(item.occupiedMinutes) && item.occupiedMinutes.length
          ? item.occupiedMinutes
          : (service.bookedSlots || [1]).map((slot) => item.startMinutes + (slot - 1) * slotStep)
            .filter((minute) => minute < item.endMinutes);
        return { ...item, occupiedMinutes, serviceSnapshot: createServiceSnapshot(service, item) };
      });
      if (changed) saveArray(key, records);
    });
  };
  backfillAppointmentSnapshots();
  const staffKeyForIndex = (staffIndex) => staffRecords[staffIndex]?.staffKey;
  const staffCanPerform = (staffIndex, serviceId) => staffServices.some((item) => item.staffKey === staffKeyForIndex(staffIndex) && item.serviceId === serviceId);
  const overlaps = (a, b) => a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
  const dayEvents = (date = selectedDate) => {
    const online = readArray(onlineKey).filter((item) => item.date === date && item.status !== "cancelled")
      .map((item) => ({ ...item, type: "online", staffIndex: Number.isInteger(item.staffIndex) ? item.staffIndex : 0 }));
    const manual = readArray(manualKey).filter((item) => item.date === date)
      .map((item) => ({ ...item, type: "offline" }));
    return [...online, ...manual].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
  };
  const daySettings = () => { try { return JSON.parse(localStorage.getItem(settingsKey) || "{}"); } catch { return {}; } };
  const staffDayBlocks = () => readArray(staffDayBlocksKey);
  const berlinHoliday = (date) => {
    const day = parseDate(date);
    const fixed = { "01-01": "Neujahr", "03-08": "Internationaler Frauentag", "05-01": "Tag der Arbeit", "10-03": "Tag der Deutschen Einheit", "12-25": "1. Weihnachtstag", "12-26": "2. Weihnachtstag" };
    const fixedName = fixed[date.slice(5)];
    if (fixedName) return fixedName;
    const year = day.getFullYear();
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const easterDay = (h + l - 7 * m + 114) % 31 + 1;
    const easter = new Date(year, month - 1, easterDay, 12);
    for (const [offset, name] of [[-2, "Karfreitag"], [1, "Ostermontag"], [39, "Christi Himmelfahrt"], [50, "Pfingstmontag"]]) {
      const holiday = new Date(easter);
      holiday.setDate(holiday.getDate() + offset);
      if (dateValue(holiday) === date) return name;
    }
    return "";
  };
  const weeklyHours = (date) => localRepository.listOpeningHours().find((row) => row.day === parseDate(date).getDay());
  const isDefaultClosed = (date) => weeklyHours(date)?.isOpen === false || Boolean(berlinHoliday(date)) || Boolean(daySettings()[date]?.isHoliday);
  const isDayBlocked = (date, staffIndex) => {
    const setting = daySettings()[date];
    if (setting?.isBlockedDay === true || (setting?.isBlockedDay !== false && isDefaultClosed(date))) return true;
    const blocks = staffDayBlocks().filter((block) => block.date === date);
    return staffIndex === undefined
      ? staff.every((_, index) => blocks.some((block) => block.staffIndex === index))
      : blocks.some((block) => block.staffIndex === staffIndex);
  };
  const workingHours = (date) => {
    const rule = weeklyHours(date);
    const regularOpen = rule?.openMinutes ?? 10 * 60;
    const regularClose = rule?.closeMinutes ?? regularOpen;
    const saved = daySettings()[date];
    return { openMinutes: saved?.openMinutes ?? regularOpen, closeMinutes: Math.min(saved?.closeMinutes ?? regularClose, regularClose) };
  };
  const timeBlocksFor = (date, staffIndex) => readArray(timeBlocksKey).filter((block) => block.date === date && (staffIndex === undefined || block.staffIndex == null || block.staffIndex === staffIndex));
  const selectedStaffIndex = () => {
    const value = document.getElementById("availabilityStaff").value;
    return value === "all" ? null : Number(value);
  };
  const isPortraitSchedule = () => window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches;
  const visibleStaffLimit = () => isPortraitSchedule() ? 2 : 4;
  const visibleStaffIndexes = () => {
    const limit = visibleStaffLimit();
    const indexes = staffRecords.map((_, index) => index);
    if (showAllStaff) return indexes.slice(0, limit);
    const selected = indexes.filter((index) => selectedVisibleStaffKeys.has(staffRecords[index].staffKey)).slice(0, limit);
    return selected.length ? selected : indexes.slice(0, Math.min(1, limit));
  };
  function renderStaffVisibilityOptions() {
    const limit = visibleStaffLimit();
    if (!showAllStaff && selectedVisibleStaffKeys.size > limit) {
      selectedVisibleStaffKeys = new Set(staffRecords.filter((employee) => selectedVisibleStaffKeys.has(employee.staffKey)).slice(0, limit).map((employee) => employee.staffKey));
    }
    const selectedCount = selectedVisibleStaffKeys.size;
    document.getElementById("showAllStaff").checked = showAllStaff;
    document.getElementById("visibleStaffOptions").innerHTML = staffRecords.map((employee, index) => {
      const checked = !showAllStaff && selectedVisibleStaffKeys.has(employee.staffKey);
      const disabled = !checked && !showAllStaff && selectedCount >= limit;
      return `<label><input type="checkbox" value="${escapeHtml(employee.staffKey)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span><i style="--staff-color:${escapeHtml(employee.color || "#d7ef57")}">${escapeHtml((employee.shortName || staff[index] || "M").slice(0, 2))}</i>${escapeHtml(employee.shortName || staff[index])}</span></label>`;
    }).join("");
    document.getElementById("staffVisibilityHint").textContent = `Maximal ${limit} Mitarbeiter in dieser Ansicht.`;
  }
  const occupiedSlots = (item) => {
    if (Array.isArray(item.occupiedMinutes) && item.occupiedMinutes.length) return item.occupiedMinutes;
    const service = serviceForItem(item);
    if (Array.isArray(service?.bookedSlots) && service.bookedSlots.length) return service.bookedSlots.map((slot) => item.startMinutes + (slot - 1) * slotStep);
    return Array.from({ length: Math.ceil((item.endMinutes - item.startMinutes) / slotStep) }, (_, index) => item.startMinutes + index * slotStep);
  };
  const occupiedInRange = (startMinutes, endMinutes, staffIndex = null) => dayEvents().some((item) => (staffIndex == null || item.staffIndex === staffIndex) && occupiedSlots(item).some((minute) => minute < endMinutes && minute + slotStep > startMinutes));
  const bookingStatus = (date) => {
    const { openMinutes, closeMinutes } = workingHours(date);
    const occupied = new Set(dayEvents(date).flatMap(occupiedSlots).filter((minute) => minute >= openMinutes && minute < closeMinutes));
    return { count: dayEvents(date).length, percent: closeMinutes > openMinutes ? Math.min(100, occupied.size / ((closeMinutes - openMinutes) / slotStep) * 100) : 0 };
  };
  const shiftDate = (value, days) => { const date = parseDate(value); date.setDate(date.getDate() + days); return dateValue(date); };
  const nextMonday = (value) => {
    const date = parseDate(value);
    const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + daysUntilMonday);
    return dateValue(date);
  };
  const lastSelectableDate = () => {
    const date = new Date();
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 2);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return dateValue(date);
  };
  const layoutFor = (events) => {
    const positions = [0];
    for (let minute = open; minute < close; minute += slotStep) {
      const busy = events.some((item) => item.startMinutes < minute + slotStep && item.endMinutes > minute);
      positions.push(positions.at(-1) + (busy ? busyRowHeight : emptyRowHeight));
    }
    const at = (minute) => {
      if (positions.length === 1) return 0;
      const clamped = Math.max(open, Math.min(close, minute));
      const index = Math.min(positions.length - 2, Math.floor((clamped - open) / slotStep));
      return positions[index] + (positions[index + 1] - positions[index]) * ((clamped - open - index * slotStep) / slotStep);
    };
    return { positions, at, totalHeight: positions.at(-1) };
  };
  const allocate = (events) => {
    const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);
    const laneEnds = [0, 0];
    sorted.forEach((event) => {
      event.previewLane = laneEnds[0] <= event.startMinutes ? 0 : laneEnds[1] <= event.startMinutes ? 1 : 0;
      laneEnds[event.previewLane] = Math.max(laneEnds[event.previewLane], event.endMinutes);
      event.previewSplit = sorted.some((other) => other !== event && overlaps(event, other));
    });
    return sorted;
  };

  function render() {
    const date = parseDate(selectedDate);
    const currentDay = dateValue(new Date());
    ({ openMinutes: open, closeMinutes: close } = workingHours(selectedDate));
    const shownStaffIndexes = visibleStaffIndexes();
    const events = dayEvents();
    const visibleEvents = events.filter((item) => shownStaffIndexes.includes(item.staffIndex));
    document.getElementById("availabilityToggle").classList.toggle("is-filtered", !showAllStaff);
    renderStaffVisibilityOptions();
    const weekday = `${new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(/\.$/, "")}.`;
    const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
    document.getElementById("daySummary").textContent = `${month}, ${pad(date.getDate())}, ${weekday} (${visibleEvents.length})`;
    document.getElementById("calendarMonth").textContent = new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
    const todayButton = document.getElementById("todayButton");
    todayButton.classList.toggle("is-active", selectedDate === currentDay);
    todayButton.setAttribute("aria-pressed", String(selectedDate === currentDay));
    document.getElementById("previousDay").disabled = visibleStartDate <= currentDay;
    document.getElementById("nextDay").disabled = nextMonday(visibleStartDate) > lastSelectableDate();
    const strip = document.getElementById("dayStrip");
    strip.className = `mini-day-strip ${visibleStartDate === currentDay ? "today-page" : "future-page"}`;
    strip.innerHTML = Array.from({ length: 7 }, (_, index) => {
      const value = shiftDate(visibleStartDate, index);
      const day = parseDate(value);
      const outOfRange = value > lastSelectableDate();
      const status = outOfRange ? { count: 0, percent: 0 } : bookingStatus(value);
      const blocked = isDayBlocked(value);
      const holiday = berlinHoliday(value);
      const closed = isDefaultClosed(value);
      const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day).replace(/\.$/, "");
      const label = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(day);
      return `<button class="mini-day ${value === selectedDate ? "selected" : ""} ${blocked ? "blocked" : ""}" type="button" data-day="${value}" aria-label="${escapeHtml(label)}${outOfRange ? ": außerhalb des Buchungszeitraums" : `: ${status.count} Termine${holiday ? `, ${holiday}` : ""}${blocked ? ", blockiert" : ""}`}" aria-pressed="${value === selectedDate}" ${outOfRange ? "disabled" : ""}><span class="day-weekday">${escapeHtml(weekdayShort)}</span><strong>${pad(day.getDate())}</strong>${closed || blocked || outOfRange ? "" : `<span class="day-status-bar"><span style="width:${status.percent}%"></span></span>`}</button>`;
    }).join("");
    const layout = layoutFor(events);
    const hours = Array.from({ length: close > open ? (close - open) / 60 + 1 : 0 }, (_, index) => {
      const minute = open + index * 60;
      return `<div class="hour-label" style="top:${layout.at(minute)}px">${pad(Math.floor(minute / 60))}</div>`;
    }).join("");
    const rows = Array.from({ length: (close - open) / slotStep }, (_, index) => `<div class="time-row ${index % 2 === 0 ? "hour-row" : "half-row"}" style="top:${layout.positions[index]}px;height:${layout.positions[index + 1] - layout.positions[index]}px"></div>`).join("");
    const staffMarkup = staff.map((name, index) => {
      if (!shownStaffIndexes.includes(index)) return "";
      const dayBlocked = isDayBlocked(selectedDate, index);
      const blocks = timeBlocksFor(selectedDate, index);
      const shades = dayBlocked
        ? `<div class="availability-shade" style="top:0;height:${layout.totalHeight}px"></div>`
        : blocks.map((block) => `<div class="availability-shade" style="top:${layout.at(block.startMinutes)}px;height:${layout.at(block.endMinutes) - layout.at(block.startMinutes)}px"></div>`).join("");
      const blockMarkup = dayBlocked
        ? `<article class="calendar-block day-block" style="top:0;height:${layout.totalHeight}px"><div class="block-heading"><strong>Tag blockiert</strong>${canManageStaff(index) ? `<button class="event-menu-button" type="button" data-menu="day-${index}" aria-label="Sperroptionen" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>` : ""}</div>${canManageStaff(index) ? `<div class="event-menu" data-menu-panel="day-${index}" hidden><button type="button" data-remove-block-day="${index}">Sperre entfernen</button></div>` : ""}</article>`
        : blocks.map((block) => `<article class="calendar-block time-block" style="top:${layout.at(block.startMinutes)}px;height:${layout.at(block.endMinutes) - layout.at(block.startMinutes)}px"><div class="block-heading"><strong>Blockiert</strong>${canManageStaff(index) ? `<button class="event-menu-button" type="button" data-menu="block-${escapeHtml(block.id)}" aria-label="Sperroptionen" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>` : ""}</div><span>${time(block.startMinutes)}–${time(block.endMinutes)}</span>${canManageStaff(index) ? `<div class="event-menu" data-menu-panel="block-${escapeHtml(block.id)}" hidden><button type="button" data-remove-block-time="${escapeHtml(block.id)}">Sperre entfernen</button></div>` : ""}</article>`).join("");
      const entries = allocate(events.filter((item) => item.staffIndex === index));
      const eventMarkup = entries.map((item) => {
        const service = serviceForItem(item);
        const top = layout.at(item.startMinutes);
        const height = layout.at(item.endMinutes) - top;
        if (height <= 0) return "";
        const note = item.type === "online" ? item.name : item.note;
        return `<article class="calendar-event ${item.previewSplit ? `split lane-${item.previewLane}` : "full"}" style="--service-color:${escapeHtml(service?.color || "#e7ece8")};top:${top}px;height:${height}px" title="${escapeHtml(service?.shortName || item.serviceId)} · ${time(item.startMinutes)}–${time(item.endMinutes)}">
          <button class="event-main" type="button" data-detail="${escapeHtml(item.id)}" aria-label="Termindetails: ${escapeHtml(service?.shortName || item.serviceId || "Termin")}, ${time(item.startMinutes)} bis ${time(item.endMinutes)}">
            <strong>${escapeHtml(service?.shortName || item.serviceId || "Termin")}</strong>
            ${note ? `<span class="event-detail">${escapeHtml(note)}</span>` : ""}
            <span class="event-time">${time(item.startMinutes)}–${time(item.endMinutes)}</span>
            ${item.type === "online" ? `<span class="online-indicator" aria-label="Online" title="Online"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/></svg></span>` : ""}
          </button>
        </article>`;
      }).join("");
      const employee = staffRecords[index];
      return `<section class="staff-column ${canManageStaff(index) ? "is-editable" : "is-readonly"}" aria-label="${escapeHtml(name)}${canManageStaff(index) ? "" : ", nur lesen"}"><div class="staff-name"><span class="staff-avatar" style="--staff-color:${escapeHtml(employee?.color || "#d7ef57")}">${escapeHtml(name.slice(0, 2))}</span><strong>${escapeHtml(name)}</strong>${canManageStaff(index) ? "" : `<span class="readonly-label">Nur lesen</span>`}</div><div class="staff-timeline" style="height:${layout.totalHeight}px">${shades}${rows}${blockMarkup}${eventMarkup}</div></section>`;
    }).join("");
    board.innerHTML = `<div class="time-gutter"><div class="gutter-heading"></div><div class="time-labels" style="height:${layout.totalHeight}px">${hours}</div></div><div class="staff-columns ${shownStaffIndexes.length === 1 ? "single-staff" : ""}" style="--staff-count:${Math.max(1, shownStaffIndexes.length)}">${staffMarkup}</div>`;
    const addStaffIndex = shownStaffIndexes.length === 1 ? shownStaffIndexes[0] : null;
    document.getElementById("addBookingButton").disabled = close <= open || (addStaffIndex == null ? isDayBlocked(selectedDate) : isDayBlocked(selectedDate, addStaffIndex));
    const now = new Date();
    if (dateValue(now) === selectedDate) {
      const minute = now.getHours() * 60 + now.getMinutes();
      if (minute >= open && minute <= close) {
        const line = document.createElement("div");
        line.className = "now-line";
        line.style.top = `${layout.at(minute)}px`;
        board.querySelectorAll(".staff-timeline").forEach((timeline) => timeline.append(line.cloneNode(true)));
      }
    }
    renderLog();
    renderAvailability();
  }

  function renderLog() {
    const online = readArray(onlineKey).filter((item) => item.date >= dateValue(new Date())).sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);
    const list = document.getElementById("bookingLogList");
    document.getElementById("logCount").textContent = `${online.length}`;
    list.innerHTML = online.length ? online.map((item) => {
      const cancelled = item.status === "cancelled";
      const phone = item.phone || (item.id.startsWith("preview-today-online-1") ? "+49 30 5550103" : item.id.startsWith("preview-today-online-2") ? "+49 30 5550104" : "");
      const canCancel = canManageStaff(Number.isInteger(item.staffIndex) ? item.staffIndex : 0);
      return `<article class="log-entry ${cancelled ? "cancelled" : ""}"><div class="log-actions">${cancelled || !canCancel ? "" : `<button class="cancel-log" type="button" data-cancel="${escapeHtml(item.id)}" aria-label="Buchung stornieren"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg><span>Stornieren</span></button>`}</div><div class="log-copy"><div class="log-primary"><strong>${escapeHtml(item.name || "Kunde")}</strong>${phone ? `<span class="log-phone">${escapeHtml(phone)}</span>` : ""}</div><span>${escapeHtml(serviceForItem(item)?.shortName || item.serviceId)} · ${escapeHtml(item.date)} · ${time(item.startMinutes)}</span></div></article>`;
    }).join("") : `<p class="empty-log">Noch keine Online-Buchungen.</p>`;
  }

  function renderAvailability() {
    const scope = mutationStaffIndex();
    const setting = daySettings()[selectedDate];
    const globalBlock = setting?.isBlockedDay === true || (setting?.isBlockedDay !== false && isDefaultClosed(selectedDate));
    const blocked = scope == null ? isDayBlocked(selectedDate) : isDayBlocked(selectedDate, scope);
    const dayButton = document.getElementById("dayBlockButton");
    dayButton.textContent = globalBlock && scope != null ? "Alle Mitarbeiter blockiert" : blocked ? "Tag freigeben" : "Tag blockieren";
    dayButton.disabled = globalBlock && scope != null;
    document.getElementById("timeBlockToggle").disabled = blocked || close <= open;
    if (blocked) {
      document.getElementById("timeBlockFields").hidden = true;
      document.getElementById("timeBlockToggle").setAttribute("aria-expanded", "false");
    }
    const blocks = readArray(timeBlocksKey).filter((block) => block.date === selectedDate && (scope == null ? block.staffIndex == null : block.staffIndex === scope)).sort((a, b) => a.startMinutes - b.startMinutes);
    document.getElementById("existingTimeBlocks").innerHTML = blocks.map((block) => `<div class="existing-block"><span>${time(block.startMinutes)}–${time(block.endMinutes)}</span><button type="button" data-unblock-time="${escapeHtml(block.id)}" aria-label="${time(block.startMinutes)} bis ${time(block.endMinutes)} freigeben">Freigeben</button></div>`).join("");
    const startSelect = document.getElementById("timeBlockStart");
    const endSelect = document.getElementById("timeBlockEnd");
    const sameDate = startSelect.dataset.date === selectedDate;
    const previousStart = sameDate ? Number(startSelect.value) : open;
    const previousEnd = sameDate ? Number(endSelect.value) : open + slotStep;
    fill(startSelect, Array.from({ length: (close - open) / slotStep }, (_, index) => [open + index * slotStep, time(open + index * slotStep)]));
    fill(endSelect, Array.from({ length: (close - open) / slotStep }, (_, index) => [open + (index + 1) * slotStep, time(open + (index + 1) * slotStep)]));
    startSelect.value = previousStart >= open && previousStart < close ? String(previousStart) : String(open);
    endSelect.value = previousEnd > Number(startSelect.value) && previousEnd <= close ? String(previousEnd) : String(Number(startSelect.value) + slotStep);
    startSelect.dataset.date = selectedDate;
    document.getElementById("timeBlockHint").textContent = blocked ? "Der gesamte Tag ist blockiert." : "";
  }

  function closeAvailability() {
    document.getElementById("availabilityPanel").hidden = true;
    document.getElementById("availabilityToggle").setAttribute("aria-expanded", "false");
    document.getElementById("timeBlockFields").hidden = true;
    document.getElementById("timeBlockToggle").setAttribute("aria-expanded", "false");
  }
  function showToast(message, tone = "success") {
    clearTimeout(toastTimeout);
    toast.classList.toggle("error", tone === "error");
    toast.hidden = false;
    document.getElementById("toastMessage").textContent = message;
    toastTimeout = setTimeout(() => { toast.hidden = true; }, 4500);
  }

  const fill = (element, entries) => { element.innerHTML = entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join(""); };
  function availableStartTimes() {
    const service = findService(document.getElementById("bookingService").value);
    const staffIndex = Number(document.getElementById("bookingEmployee").value);
    if (!service || !staffCanPerform(staffIndex, service.id) || isDayBlocked(selectedDate, staffIndex)) return [];
    const sameStaff = dayEvents().filter((item) => item.staffIndex === staffIndex);
    const blocks = timeBlocksFor(selectedDate, staffIndex);
    return Array.from({ length: Math.max(0, (close - open) / slotStep) }, (_, index) => open + index * slotStep).filter((start) => {
      const end = start + Number(service.duration || slotStep);
      if (blocks.some((block) => start < block.endMinutes && end > block.startMinutes)) return false;
      return !Array.from({ length: Math.ceil((end - start) / slotStep) }, (_, index) => start + index * slotStep)
        .some((minute) => sameStaff.filter((item) => item.startMinutes < minute + slotStep && item.endMinutes > minute).length >= 2);
    });
  }
  function updateBookingTimes() {
    const select = document.getElementById("bookingStart");
    const previous = select.value;
    const starts = availableStartTimes();
    fill(select, starts.length ? starts.map((minute) => [minute, time(minute)]) : [["", "Keine freie Uhrzeit"]]);
    if (starts.some((minute) => String(minute) === previous)) select.value = previous;
    select.disabled = starts.length === 0;
    form.querySelector('[type="submit"]').disabled = starts.length === 0;
    document.getElementById("bookingFormMessage").textContent = starts.length ? "" : "Für diesen Service sind bei diesem Mitarbeiter keine Startzeiten frei.";
  }
  function updateServiceOptions() {
    const category = document.getElementById("bookingCategory").value;
    const staffIndex = Number(document.getElementById("bookingEmployee").value);
    const available = services.filter((item) => item.category === category && staffCanPerform(staffIndex, item.id));
    fill(document.getElementById("bookingService"), available.length
      ? available.map((item) => [item.id, `${item.shortName} · ${item.duration} Min.`])
      : [["", "Keine passenden Services"]]);
    updateBookingTimes();
  }
  function openBooking() {
    form.reset();
    document.getElementById("bookingFormMessage").textContent = "";
    fill(document.getElementById("bookingEmployee"), staff.map((name, index) => [index, name]));
    const firstVisibleStaff = visibleStaffIndexes()[0];
    if (firstVisibleStaff != null) document.getElementById("bookingEmployee").value = String(firstVisibleStaff);
    document.getElementById("bookingEmployee").disabled = !isOwner();
    fill(document.getElementById("bookingCategory"), Object.entries(categories));
    updateServiceOptions();
    bookingDialog.showModal();
  }
  function openDetails(id) {
    const item = dayEvents().find((entry) => String(entry.id) === id);
    if (!item) return;
    const service = serviceForItem(item);
    const dateLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDate(item.date));
    const fields = [
      ["Datum", dateLabel],
      ["Uhrzeit", `${time(item.startMinutes)}–${time(item.endMinutes)}`],
      ["Mitarbeiter", staff[item.staffIndex] || staff[0]],
      ["Art", item.type === "online" ? "Online" : "Manuell"]
    ];
    if (item.name) fields.push(["Name", item.name]);
    if (item.phone) fields.push(["Telefon", item.phone]);
    if (item.email) fields.push(["E-Mail", item.email]);
    if (item.note) fields.push(["Notiz", item.note]);
    document.getElementById("detailTitle").textContent = service?.shortName || item.serviceId || "Termin";
    document.getElementById("detailList").innerHTML = fields.map(([label, value]) => `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
    const detailActions = document.getElementById("detailActions");
    const canDelete = item.type === "offline" && canManageStaff(item.staffIndex);
    detailActions.hidden = !canDelete;
    document.getElementById("detailDelete").dataset.delete = canDelete ? String(item.id) : "";
    detailDialog.showModal();
  }
  function confirmAction(title, message, label, action) {
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmText").textContent = message;
    document.getElementById("confirmAction").textContent = label;
    pendingConfirm = action;
    confirmDialog.showModal();
  }

  fill(document.getElementById("availabilityStaff"), [["all", t("admin.allEmployees")], ...staff.map((name, index) => [index, name])]);
  const previewAccounts = await auth.listAccounts();
  fill(document.getElementById("previewAccount"), previewAccounts.map((account) => [account.id, `${account.email} · ${account.role === "admin" ? "Admin" : account.role === "owner" ? "Owner" : "Staff"}`]));
  document.getElementById("previewLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      session = await auth.signIn(document.getElementById("previewAccount").value, document.getElementById("previewPassword").value);
      applySession();
      showToast(`${session.email} ist angemeldet.`);
    } catch (error) { showToast(error.message, "error"); }
  });
  document.getElementById("previewLogout").addEventListener("click", () => {
    session = null;
    auth.signOut();
    closeAvailability();
    document.getElementById("previewMain").hidden = true;
    document.getElementById("previewSession").hidden = true;
    document.getElementById("previewLoginForm").hidden = false;
    document.getElementById("settingsLink").hidden = true;
  });
  document.getElementById("todayButton").addEventListener("click", () => { visibleStartDate = dateValue(new Date()); selectedDate = visibleStartDate; closeAvailability(); render(); });
  document.getElementById("previousDay").addEventListener("click", () => { const today = dateValue(new Date()); if (visibleStartDate <= today) return; const previous = shiftDate(visibleStartDate, -7); visibleStartDate = previous <= today ? today : previous; selectedDate = visibleStartDate; closeAvailability(); render(); });
  document.getElementById("nextDay").addEventListener("click", () => { const next = nextMonday(visibleStartDate); if (next > lastSelectableDate()) return; visibleStartDate = next; selectedDate = visibleStartDate; closeAvailability(); render(); });
  document.getElementById("dayStrip").addEventListener("click", (event) => { const button = event.target.closest("[data-day]"); if (!button || button.disabled) return; selectedDate = button.dataset.day; closeAvailability(); render(); });
  document.getElementById("addBookingButton").addEventListener("click", openBooking);
  document.getElementById("bookingCategory").addEventListener("change", updateServiceOptions);
  document.getElementById("bookingService").addEventListener("change", updateBookingTimes);
  document.getElementById("bookingEmployee").addEventListener("change", updateServiceOptions);
  document.getElementById("toastClose").addEventListener("click", () => { clearTimeout(toastTimeout); toast.hidden = true; });
  document.getElementById("confirmAction").addEventListener("click", () => { const result = pendingConfirm?.(); pendingConfirm = null; confirmDialog.close(); render(); if (result?.toast) showToast(result.toast, result.tone); });
  document.getElementById("availabilityToggle").addEventListener("click", () => {
    const panel = document.getElementById("availabilityPanel");
    panel.hidden = !panel.hidden;
    document.getElementById("availabilityToggle").setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.getElementById("showAllStaff").addEventListener("change", (event) => {
    showAllStaff = event.target.checked;
    if (!showAllStaff && selectedVisibleStaffKeys.size === 0 && staffRecords[0]) selectedVisibleStaffKeys.add(staffRecords[0].staffKey);
    render();
  });
  document.getElementById("visibleStaffOptions").addEventListener("change", (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    showAllStaff = false;
    if (input.checked) {
      if (selectedVisibleStaffKeys.size >= visibleStaffLimit()) {
        input.checked = false;
        showToast(`In dieser Ansicht können maximal ${visibleStaffLimit()} Mitarbeiter angezeigt werden.`, "error");
      } else selectedVisibleStaffKeys.add(input.value);
    } else {
      selectedVisibleStaffKeys.delete(input.value);
      if (selectedVisibleStaffKeys.size === 0) {
        input.checked = true;
        selectedVisibleStaffKeys.add(input.value);
        showToast("Mindestens ein Mitarbeiter muss sichtbar bleiben.", "error");
      }
    }
    render();
  });
  document.getElementById("availabilityStaff").addEventListener("change", () => { closeAvailability(); render(); });
  document.getElementById("dayBlockButton").addEventListener("click", () => {
    const scope = mutationStaffIndex();
    if (scope != null && (daySettings()[selectedDate]?.isBlockedDay === true || (daySettings()[selectedDate]?.isBlockedDay !== false && isDefaultClosed(selectedDate)))) return;
    const nextBlocked = !(scope == null ? isDayBlocked(selectedDate) : isDayBlocked(selectedDate, scope));
    if (nextBlocked && occupiedInRange(open, close, scope)) { closeAvailability(); showToast("Tag nicht blockiert: Für die Auswahl sind bereits belegte Zeiten vorhanden.", "error"); return; }
    const scopeLabel = scope == null ? "alle Mitarbeiter" : staff[scope];
    confirmAction(nextBlocked ? "Tag blockieren?" : "Tag freigeben?", nextBlocked ? `Den Tag für ${scopeLabel} sperren?` : `Den Tag für ${scopeLabel} wieder freigeben?`, nextBlocked ? "Blockieren" : "Freigeben", () => {
      if (scope == null) {
        const settings = daySettings();
        settings[selectedDate] = { ...settings[selectedDate], date: selectedDate, openMinutes: open, closeMinutes: close, isBlockedDay: nextBlocked };
        localStorage.setItem(settingsKey, JSON.stringify(settings));
        if (!nextBlocked) saveArray(staffDayBlocksKey, staffDayBlocks().filter((block) => block.date !== selectedDate));
      } else {
        const blocks = staffDayBlocks().filter((block) => block.date !== selectedDate || block.staffIndex !== scope);
        if (nextBlocked) blocks.push({ date: selectedDate, staffIndex: scope });
        saveArray(staffDayBlocksKey, blocks);
      }
      closeAvailability();
      return { toast: `Der Tag wurde für ${scopeLabel} ${nextBlocked ? "blockiert" : "freigegeben"}.` };
    });
  });
  document.getElementById("timeBlockToggle").addEventListener("click", () => {
    const fields = document.getElementById("timeBlockFields");
    fields.hidden = !fields.hidden;
    document.getElementById("timeBlockToggle").setAttribute("aria-expanded", String(!fields.hidden));
  });
  document.getElementById("timeBlockStart").addEventListener("change", () => {
    const start = Number(document.getElementById("timeBlockStart").value);
    const end = document.getElementById("timeBlockEnd");
    if (Number(end.value) <= start) end.value = String(start + slotStep);
  });
  document.getElementById("timeBlockAction").addEventListener("click", () => {
    const scope = mutationStaffIndex();
    const start = Number(document.getElementById("timeBlockStart").value);
    const end = Number(document.getElementById("timeBlockEnd").value);
    const hint = document.getElementById("timeBlockHint");
    if (end <= start) { hint.textContent = "Bitte eine gültige Zeitspanne wählen."; showToast(hint.textContent, "error"); return; }
    if (timeBlocksFor(selectedDate, scope).some((block) => start < block.endMinutes && end > block.startMinutes)) { hint.textContent = "Die Zeitspanne ist bereits blockiert."; showToast(hint.textContent, "error"); return; }
    if (occupiedInRange(start, end, scope)) { closeAvailability(); showToast("Uhrzeit nicht blockiert: Für die Auswahl sind bereits belegte Zeiten vorhanden.", "error"); return; }
    const scopeLabel = scope == null ? "alle Mitarbeiter" : staff[scope];
    confirmAction("Uhrzeit blockieren?", `${time(start)}–${time(end)} für ${scopeLabel} sperren?`, "Blockieren", () => {
      saveArray(timeBlocksKey, [...readArray(timeBlocksKey), { id: crypto.randomUUID(), date: selectedDate, staffIndex: scope, startMinutes: start, endMinutes: end }]);
      closeAvailability();
      return { toast: `${time(start)}–${time(end)} wurde für ${scopeLabel} blockiert.` };
    });
  });
  document.getElementById("existingTimeBlocks").addEventListener("click", (event) => {
    const button = event.target.closest("[data-unblock-time]");
    if (!button) return;
    const target = readArray(timeBlocksKey).find((block) => block.id === button.dataset.unblockTime);
    if (!target || (target.staffIndex != null && !canManageStaff(target.staffIndex)) || (target.staffIndex == null && !isOwner())) { denyMutation(); return; }
    confirmAction("Uhrzeit freigeben?", "Diese Sperre entfernen und die Uhrzeit wieder freigeben?", "Freigeben", () => {
      saveArray(timeBlocksKey, readArray(timeBlocksKey).filter((block) => block.id !== button.dataset.unblockTime));
      closeAvailability();
      return { toast: "Die Zeitsperre wurde entfernt." };
    });
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".availability-shell")) closeAvailability(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAvailability(); });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  [bookingDialog, detailDialog, confirmDialog].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const service = findService(document.getElementById("bookingService").value);
    const staffIndex = Number(document.getElementById("bookingEmployee").value);
    if (!canManageStaff(staffIndex)) { denyMutation(); return; }
    const startMinutes = Number(document.getElementById("bookingStart").value);
    const endMinutes = startMinutes + Number(service?.duration || 30);
    if (!service || !availableStartTimes().includes(startMinutes)) {
      updateBookingTimes();
      document.getElementById("bookingFormMessage").textContent = "Diese Startzeit ist nicht mehr frei. Bitte eine andere Uhrzeit wählen.";
      return;
    }
    const manual = readArray(manualKey);
    const occupiedMinutes = (service.bookedSlots || [1]).map((slot) => startMinutes + (slot - 1) * slotStep).filter((minute) => minute < endMinutes);
    manual.push({ id: crypto.randomUUID(), date: selectedDate, staffIndex, serviceId: service.id, startMinutes, endMinutes, occupiedMinutes, serviceSnapshot: createServiceSnapshot(service, { startMinutes, endMinutes }), note: document.getElementById("bookingNote").value.trim() });
    saveArray(manualKey, manual);
    bookingDialog.close();
    render();
    showToast(`${service.shortName} um ${time(startMinutes)} wurde für ${staff[staffIndex]} eingetragen.`);
  });
  board.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-detail]");
    const menuButton = event.target.closest("[data-menu]");
    const removeDayButton = event.target.closest("[data-remove-block-day]");
    const removeTimeButton = event.target.closest("[data-remove-block-time]");
    if (detailButton) { openDetails(detailButton.dataset.detail); return; }
    if (menuButton) {
      const panel = board.querySelector(`[data-menu-panel="${CSS.escape(menuButton.dataset.menu)}"]`);
      const shouldOpen = panel.hidden;
      board.querySelectorAll(".event-menu").forEach((item) => { item.hidden = true; });
      board.querySelectorAll("[data-menu]").forEach((item) => { item.setAttribute("aria-expanded", "false"); });
      panel.hidden = !shouldOpen;
      menuButton.setAttribute("aria-expanded", String(shouldOpen));
    }
    if (removeDayButton) {
      const staffIndex = Number(removeDayButton.dataset.removeBlockDay);
      if (!canManageStaff(staffIndex)) { denyMutation(); return; }
      confirmAction("Tag freigeben?", "Die Tagessperre entfernen?", "Freigeben", () => {
      const setting = daySettings()[selectedDate];
      const globalBlock = setting?.isBlockedDay === true || (setting?.isBlockedDay !== false && isDefaultClosed(selectedDate));
      if (globalBlock) {
        const settings = daySettings();
        settings[selectedDate] = { ...settings[selectedDate], date: selectedDate, isBlockedDay: false };
        localStorage.setItem(settingsKey, JSON.stringify(settings));
        saveArray(staffDayBlocksKey, staffDayBlocks().filter((block) => block.date !== selectedDate));
      } else {
        saveArray(staffDayBlocksKey, staffDayBlocks().filter((block) => block.date !== selectedDate || block.staffIndex !== staffIndex));
      }
      return { toast: "Die Tagessperre wurde entfernt." };
      });
    }
    if (removeTimeButton) {
      const target = readArray(timeBlocksKey).find((block) => block.id === removeTimeButton.dataset.removeBlockTime);
      if (!target || (target.staffIndex != null && !canManageStaff(target.staffIndex)) || (target.staffIndex == null && !isOwner())) { denyMutation(); return; }
      confirmAction("Uhrzeit freigeben?", "Diese Zeitsperre entfernen?", "Freigeben", () => {
      saveArray(timeBlocksKey, readArray(timeBlocksKey).filter((block) => block.id !== removeTimeButton.dataset.removeBlockTime));
      return { toast: "Die Zeitsperre wurde entfernt." };
      });
    }
  });
  document.getElementById("detailDelete").addEventListener("click", (event) => {
    const id = event.currentTarget.dataset.delete;
    const target = dayEvents().find((item) => String(item.id) === id);
    if (!target || target.type !== "offline" || !canManageStaff(target.staffIndex)) { denyMutation(); return; }
    detailDialog.close();
    confirmAction("Termin löschen?", "Dieser manuell angelegte Termin wird aus dem Tagesplan entfernt.", "Löschen", () => {
      const manual = readArray(manualKey);
      if (!manual.some((item) => String(item.id) === id)) return { toast: "Termin nicht gefunden.", tone: "error" };
      saveArray(manualKey, manual.filter((item) => String(item.id) !== id));
      return { toast: "Der manuelle Termin wurde gelöscht." };
    });
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".event-menu, .event-menu-button")) board.querySelectorAll(".event-menu").forEach((item) => { item.hidden = true; }); });
  document.getElementById("bookingLogList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel]");
    if (!button) return;
    const target = readArray(onlineKey).find((item) => item.id === button.dataset.cancel);
    if (!target || !canManageStaff(Number.isInteger(target.staffIndex) ? target.staffIndex : 0)) { denyMutation(); return; }
    confirmAction("Buchung stornieren?", "Die Online-Buchung bleibt im Buchungslog als storniert sichtbar.", "Stornieren", () => {
      const online = readArray(onlineKey);
      const item = online.find((entry) => entry.id === button.dataset.cancel);
      if (!item || item.status === "cancelled") return { toast: "Buchung nicht gefunden oder bereits storniert.", tone: "error" };
      item.status = "cancelled";
      saveArray(onlineKey, online);
      return { toast: "Die Online-Buchung wurde storniert." };
    });
  });
  setInterval(render, 60_000);
  window.addEventListener("resize", render);
  localRepository.subscribe("services", () => {
    services = localRepository.listServices();
    render();
  });
  localRepository.subscribe("staff-services", () => {
    staffServices = localRepository.listStaffServices();
    render();
  });
  localRepository.subscribe("staff", () => {
    staffRecords = localRepository.listStaff(); staff = staffRecords.map((employee) => employee.shortName);
    const validKeys = new Set(staffRecords.map((employee) => employee.staffKey));
    selectedVisibleStaffKeys = new Set([...selectedVisibleStaffKeys].filter((key) => validKeys.has(key)));
    fill(document.getElementById("availabilityStaff"), [["all", t("admin.allEmployees")], ...staff.map((name, index) => [index, name])]);
    render();
  });
  localRepository.subscribe("shop-profile", applyShopProfile);
  localRepository.subscribe("categories", () => {
    categories = Object.fromEntries(localRepository.listCategories().map((category) => [category.id, category.shortName || category.name]));
    services = localRepository.listServices();
    render();
  });
  applySession();
})();
