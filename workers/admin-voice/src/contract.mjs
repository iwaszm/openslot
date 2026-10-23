export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 60;
export const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
]);

export function isSupportedAudioType(value) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (SUPPORTED_AUDIO_TYPES.has(normalized)) return true;
  const [baseType] = normalized.split(";");
  return baseType === "audio/mp4" || baseType === "audio/webm" || baseType === "audio/ogg";
}

export class VoiceContractError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "VoiceContractError";
    this.code = code;
    this.status = status;
  }
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidDate(value) {
  if (!datePattern.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function uniqueStrings(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function localDateParts(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function shiftDate(value, days) {
  const { year, month, day } = localDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function weekday(value) {
  const { year, month, day } = localDateParts(value);
  const jsDay = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

const weekdayAliases = [
  { day: 1, values: ["周一", "星期一", "monday", "montag"] },
  { day: 2, values: ["周二", "星期二", "tuesday", "dienstag"] },
  { day: 3, values: ["周三", "星期三", "wednesday", "mittwoch"] },
  { day: 4, values: ["周四", "星期四", "thursday", "donnerstag"] },
  { day: 5, values: ["周五", "星期五", "friday", "freitag"] },
  { day: 6, values: ["周六", "星期六", "saturday", "samstag"] },
  { day: 7, values: ["周日", "星期日", "星期天", "sunday", "sonntag"] },
];

export function resolveSpokenDate(transcript, currentDate) {
  const text = String(transcript || "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return { mentioned: false, date: "" };
  const relativeDays = [
    { values: ["后天", "übermorgen", "uebermorgen", "day after tomorrow"], days: 2 },
    { values: ["明天", "morgen", "tomorrow"], days: 1 },
    { values: ["今天", "heute", "today"], days: 0 },
  ];
  for (const item of relativeDays) {
    if (item.values.some((value) => text.includes(value))) return { mentioned: true, date: shiftDate(currentDate, item.days) };
  }

  for (const item of weekdayAliases) {
    const alias = item.values.find((value) => text.includes(value));
    if (!alias) continue;
    const isNext = text.includes(`下${alias}`)
      || text.includes(`下个${alias}`)
      || text.includes(`next ${alias}`)
      || text.includes(`nächsten ${alias}`)
      || text.includes(`naechsten ${alias}`);
    const mondayOffset = 1 - weekday(currentDate);
    const targetOffset = mondayOffset + (isNext ? 7 : 0) + item.day - 1;
    return { mentioned: true, date: shiftDate(currentDate, targetOffset) };
  }
  return { mentioned: false, date: "" };
}

function normalizeAlias(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function matchCatalogAliases(transcript, items) {
  const text = normalizeAlias(transcript);
  const matches = [];
  for (const item of items || []) {
    const aliases = (item.aliases || []).map(normalizeAlias).filter((alias) => alias.length >= 2);
    const best = aliases.filter((alias) => text.includes(alias)).sort((a, b) => b.length - a.length)[0];
    if (best) matches.push({ key: item.id || item.key, length: best.length });
  }
  if (!matches.length) return { matched: false, ambiguous: false, key: "" };
  const longest = Math.max(...matches.map((item) => item.length));
  const winners = matches.filter((item) => item.length === longest);
  return winners.length === 1
    ? { matched: true, ambiguous: false, key: winners[0].key }
    : { matched: false, ambiguous: true, key: "" };
}

export function normalizeVoiceContext(input) {
  if (!input || typeof input !== "object") throw new VoiceContractError("INVALID_CONTEXT", "预约上下文无效。");
  const currentDate = String(input.currentDate || "");
  const selectedDate = String(input.selectedDate || "");
  if (!isValidDate(currentDate) || !isValidDate(selectedDate)) {
    throw new VoiceContractError("INVALID_CONTEXT", "预约上下文中的日期无效。");
  }
  const services = Array.isArray(input.services) ? input.services.slice(0, 100).map((service) => ({
    id: String(service?.id || "").trim(),
    aliases: uniqueStrings(service?.aliases),
  })).filter((service) => service.id) : [];
  const serviceIds = new Set(services.map((service) => service.id));
  const staff = Array.isArray(input.staff) ? input.staff.slice(0, 20).map((employee) => ({
    key: String(employee?.key || "").trim(),
    aliases: uniqueStrings(employee?.aliases),
    serviceIds: uniqueStrings(employee?.serviceIds, 100).filter((id) => serviceIds.has(id)),
  })).filter((employee) => employee.key) : [];
  const defaultStaffKey = String(input.defaultStaffKey || "").trim();
  if (!services.length || !staff.length || !staff.some((employee) => employee.key === defaultStaffKey)) {
    throw new VoiceContractError("INVALID_CONTEXT", "预约上下文缺少可用员工或服务。");
  }
  return {
    currentDate,
    selectedDate,
    timezone: input.timezone === "Europe/Berlin" ? input.timezone : "Europe/Berlin",
    language: ["de", "en", "zh"].includes(input.language) ? input.language : "de",
    services,
    staff,
    defaultStaffKey,
  };
}

export function finalizeVoiceAppointment(modelOutput, contextInput) {
  const context = normalizeVoiceContext(contextInput);
  const output = modelOutput && typeof modelOutput === "object" ? modelOutput : {};
  if (output.serviceAmbiguous === true) throw new VoiceContractError("AMBIGUOUS_SERVICE", "无法确定预约项目。");
  if (output.staffAmbiguous === true) throw new VoiceContractError("AMBIGUOUS_STAFF", "无法确定预约员工。");

  const serviceId = String(output.serviceId || "").trim();
  if (!serviceId) throw new VoiceContractError("MISSING_SERVICE", "请说出预约项目。");
  if (!context.services.some((service) => service.id === serviceId)) {
    throw new VoiceContractError("UNKNOWN_SERVICE", "未识别到有效的预约项目。");
  }

  const startTime = String(output.startTime || "").trim();
  const timeMatch = timePattern.exec(startTime);
  if (!timeMatch) throw new VoiceContractError("MISSING_TIME", "请说出预约开始时间。");
  if (Number(timeMatch[2]) % 30 !== 0) throw new VoiceContractError("INVALID_TIME", "预约时间必须落在 30 分钟刻度上。");

  const date = String(output.date || context.selectedDate).trim();
  if (!isValidDate(date)) throw new VoiceContractError("INVALID_DATE", "未识别到有效日期。");

  const staffMentioned = output.staffMentioned === true;
  const requestedStaffKey = String(output.staffKey || "").trim();
  if (staffMentioned && !context.staff.some((employee) => employee.key === requestedStaffKey)) {
    throw new VoiceContractError("UNKNOWN_STAFF", "未识别到有权限操作的员工。");
  }
  const staffKey = staffMentioned ? requestedStaffKey : context.defaultStaffKey;
  const employee = context.staff.find((item) => item.key === staffKey);
  if (!employee?.serviceIds.includes(serviceId)) {
    throw new VoiceContractError("STAFF_SERVICE_MISMATCH", "该员工不提供这个项目。");
  }

  return {
    date,
    startTime,
    serviceId,
    staffKey,
    note: Array.from(String(output.note || "").trim()).slice(0, 12).join(""),
  };
}

