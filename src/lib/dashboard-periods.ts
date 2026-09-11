import type { BusinessCompany } from "./business";
import { addWeeks, weekStartOf } from "./week";

const DAY_MS = 86_400_000;

/** Calendar dates use Eastern time, then UTC midnight for Prisma date fields. */
export function dashboardPeriods(company: BusinessCompany, now = new Date()) {
  const calendarDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const today = new Date(`${calendarDate}T00:00:00.000Z`);
  const weekEndExclusive = weekStartOf(today);
  const weekStart = addWeeks(weekEndExclusive, -1);
  const payrollStartDay = company === "RESORT" ? 0 : 6;
  const daysIntoPayrollWeek = (today.getUTCDay() - payrollStartDay + 7) % 7;
  const payrollWeekStart = new Date(today.getTime() - (daysIntoPayrollWeek + 7) * DAY_MS);
  return {
    today,
    weekStart,
    weekEndExclusive,
    trendStart: addWeeks(weekStart, -5),
    payrollWeekStart,
    payrollCheckDate: new Date(payrollWeekStart.getTime() + 12 * DAY_MS),
  };
}
