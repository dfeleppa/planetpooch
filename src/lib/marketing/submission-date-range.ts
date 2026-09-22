const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ZONE = "America/New_York";

function dateParts(value: Date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatEasternDate(value: Date) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseEasternDateStart(value: string) {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const calendarCheck = new Date(utcMidnight);
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return null;

  let result = new Date(utcMidnight);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = dateParts(result);
    const representedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    result = new Date(result.getTime() + utcMidnight - representedAsUtc);
  }
  return result;
}

export function addCalendarDays(value: string, days: number) {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveSubmissionDateRange(startParam?: string, endParam?: string, now = new Date()) {
  const defaultEnd = formatEasternDate(now);
  const defaultStart = addCalendarDays(defaultEnd, -29)!;
  const start = parseEasternDateStart(startParam || "") ? startParam! : defaultStart;
  const end = parseEasternDateStart(endParam || "") ? endParam! : defaultEnd;
  const normalizedStart = start <= end ? start : end;
  const normalizedEnd = start <= end ? end : start;
  return {
    start: normalizedStart,
    end: normalizedEnd,
    startAt: parseEasternDateStart(normalizedStart)!,
    endBefore: parseEasternDateStart(addCalendarDays(normalizedEnd, 1)!)!,
  };
}
