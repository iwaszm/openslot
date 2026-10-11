export function parseTime(time) {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function dateToMinutes(value) {
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) {
    return parseTime(value.slice(0, 5));
  }
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

export function timeValueToMinutes(value) {
  const text = String(value || "");
  return text.includes("T") ? dateToMinutes(text) : parseTime(text.slice(0, 5));
}
