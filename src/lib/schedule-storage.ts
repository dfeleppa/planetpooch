import { z } from "zod";
import { validateShifts, type WeeklySchedule } from "./schedule-formatter";

export type SavedScheduleSummary = { weekStart: string; title: string; revision: number; updatedAt: string };
export type SavedSchedule = SavedScheduleSummary & { schedule: WeeklySchedule };
export type ScheduleStorageResponse = { weeks: SavedScheduleSummary[]; saved: SavedSchedule | null };

export const savedScheduleInput = z.object({
  schedule: z.object({
    title: z.string().trim().min(1).max(200),
    days: z.array(z.string().min(1).max(30)).length(7),
    warnings: z.array(z.string().max(1000)).max(200),
    shifts: z.array(z.object({
      id: z.string().min(1).max(100), employee: z.string().trim().min(1).max(200),
      day: z.number().int().min(0).max(6), start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(2879),
    })).max(1000),
  }),
  expectedRevision: z.number().int().min(1).nullable(),
});

const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function calendarDate(month: string, day: string, year: string): Date {
  const index = months.indexOf(month.toLowerCase());
  const date = new Date(Date.UTC(+year, index, +day));
  if (index < 0 || +year < 2000 || +year > 2100 || date.getUTCMonth() !== index || date.getUTCDate() !== +day) throw new Error("The schedule has an invalid week date.");
  return date;
}

/** Use the actual printed calendar week as the unique key, never the filename. */
export function scheduleCalendar(title: string): { weekStart: string; days: string[] } {
  const match = /^Week of\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*[-–—]\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/i.exec(title);
  if (!match) throw new Error("The schedule needs a readable 'Week of' date range before it can be saved.");
  const start = calendarDate(match[1], match[2], match[3]);
  const end = calendarDate(match[4], match[5], match[6]);
  if (start.getUTCDay() !== 0 || end.getTime() - start.getTime() !== 6 * 86400000) throw new Error("The schedule must cover one Sunday-through-Saturday week.");
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return { weekStart: start.toISOString().slice(0, 10), days: weekdays.map((day, index) => `${day[0].toUpperCase()}${day.slice(1)} ${new Date(start.getTime() + index * 86400000).getUTCDate()}`) };
}

export function scheduleWeekStart(schedule: WeeklySchedule): string {
  const calendar = scheduleCalendar(schedule.title);
  if (schedule.days.length !== 7 || schedule.days.some((label, index) => {
    return label.slice(0, 3).toLowerCase() !== calendar.days[index].slice(0, 3).toLowerCase() || Number(label.match(/\d+$/)?.[0]) !== Number(calendar.days[index].match(/\d+$/)?.[0]);
  })) throw new Error("The day columns do not match the printed week dates.");
  validateShifts(schedule.shifts);
  return calendar.weekStart;
}

export function preferredScheduleWeek(weeks: SavedScheduleSummary[], today: string): string | undefined {
  const sorted = weeks.map(week => week.weekStart).sort();
  return sorted.find(start => start <= today && today <= new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10))
    ?? sorted.find(start => start > today) ?? sorted.at(-1);
}

export function canManageResortSchedules(user: { role?: string | null; company?: string | null } | null | undefined): boolean {
  return user?.role === "SUPER_ADMIN" || user?.role === "MANAGER" && ["CORPORATE", "RESORT"].includes(user.company ?? "");
}
