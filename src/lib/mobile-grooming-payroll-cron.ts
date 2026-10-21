const MS_PER_DAY = 86_400_000;

/** Vercel runs cron in UTC; payroll dates and the requested run time are Eastern. */
export function mobileGroomingCronWeek(now: Date, offset: number) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 3) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const localDate = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  if (localDate.getUTCDay() !== 0 || part("hour") !== 6) return null;

  // On Sunday, the current Saturday-Friday week began yesterday.
  const weekStart = new Date(localDate.getTime() - (1 + offset * 7) * MS_PER_DAY);
  const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  };
}
