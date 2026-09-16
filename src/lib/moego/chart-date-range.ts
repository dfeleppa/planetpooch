export function yearToDateRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const year = part("year");
  return { from: `${year}-01-01`, to: `${year}-${part("month")}-${part("day")}` };
}
