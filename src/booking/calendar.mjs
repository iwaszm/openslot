export function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

export function getBerlinHolidayName(value) {
  const date = new Date(`${value}T12:00:00`);
  const fixed = {
    "01-01": "Neujahr",
    "03-08": "Internationaler Frauentag",
    "05-01": "Tag der Arbeit",
    "10-03": "Tag der Deutschen Einheit",
    "12-25": "1. Weihnachtstag",
    "12-26": "2. Weihnachtstag",
  };
  if (fixed[value.slice(5)]) return fixed[value.slice(5)];

  const easter = calculateEasterSunday(date.getFullYear());
  for (const [offset, name] of [
    [-2, "Karfreitag"],
    [1, "Ostermontag"],
    [39, "Christi Himmelfahrt"],
    [50, "Pfingstmontag"],
  ]) {
    const holiday = new Date(easter);
    holiday.setDate(holiday.getDate() + offset);
    if (toDateInputValue(holiday) === value) return name;
  }
  return "";
}

export function normalizeDaySettings(settings, weeklyRule, defaults) {
  if (weeklyRule.openMinutes === null) {
    return {
      ...settings,
      openMinutes: defaults.openMinutes,
      closeMinutes: defaults.closeMinutes,
      isBlockedDay: true,
    };
  }
  return {
    ...settings,
    openMinutes: weeklyRule.openMinutes,
    closeMinutes: weeklyRule.closeMinutes,
  };
}

export function isBusinessDay(settings, weeklyRule) {
  return weeklyRule.openMinutes !== null
    && !settings.isBlockedDay
    && settings.closeMinutes > settings.openMinutes;
}

export function buildDateRange(today, days) {
  const firstDate = new Date(`${toDateInputValue(today)}T00:00:00`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(firstDate);
    date.setDate(firstDate.getDate() + index);
    return toDateInputValue(date);
  });
}

export function getInitialBookingDate({ now, days, slotStep, getWeeklyRule }) {
  const weeklyRule = getWeeklyRule(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const candidate = new Date(now);
  if (weeklyRule.openMinutes === null || currentMinutes >= weeklyRule.closeMinutes - slotStep) {
    candidate.setDate(candidate.getDate() + 1);
  }

  for (let offset = 0; offset < days; offset += 1) {
    const rule = getWeeklyRule(candidate);
    if (rule.openMinutes !== null) return toDateInputValue(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return toDateInputValue(candidate);
}

export function getCalendarWeekStartIndex(dates, currentIndex, direction, pageSize) {
  const lastFullPageStart = Math.max(0, dates.length - pageSize);
  const startIndex = Math.min(currentIndex, lastFullPageStart);
  const isMonday = (value) => new Date(`${value}T00:00:00`).getDay() === 1;

  if (direction > 0) {
    const nextMonday = dates.findIndex((date, index) => (
      index > startIndex && index <= lastFullPageStart && isMonday(date)
    ));
    return nextMonday >= 0 ? nextMonday : startIndex;
  }

  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (isMonday(dates[index])) return index;
  }
  return 0;
}

function calculateEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(
    year,
    Math.floor((h + l - 7 * m + 114) / 31) - 1,
    ((h + l - 7 * m + 114) % 31) + 1,
    12,
  );
}
