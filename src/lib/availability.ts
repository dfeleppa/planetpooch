/**
 * Helpers for the weekly availability schedule. Times are stored and exchanged
 * as "HH:MM" 24-hour strings on 30-minute boundaries (e.g. "09:00", "17:30").
 */
import { DayOfWeek } from "@prisma/client";

export const DAYS_OF_WEEK: { value: DayOfWeek; label: string; short: string }[] = [
  { value: "SUNDAY", label: "Sunday", short: "Sun" },
  { value: "MONDAY", label: "Monday", short: "Mon" },
  { value: "TUESDAY", label: "Tuesday", short: "Tue" },
  { value: "WEDNESDAY", label: "Wednesday", short: "Wed" },
  { value: "THURSDAY", label: "Thursday", short: "Thu" },
  { value: "FRIDAY", label: "Friday", short: "Fri" },
  { value: "SATURDAY", label: "Saturday", short: "Sat" },
];

/** All 48 half-hour slots from 12:00 AM through 11:30 PM. */
export function timeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      slots.push({ value, label: formatTimeLabel(value) });
    }
  }
  return slots;
}

/** "09:00" → "9:00 AM", "23:30" → "11:30 PM". */
export function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}

/** True iff `value` matches "HH:MM" with MM ∈ {00, 30} and HH ∈ 00..23. */
export function isValidTimeSlot(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):(00|30)$/.test(value);
}

export function isValidDayOfWeek(value: unknown): value is DayOfWeek {
  return (
    typeof value === "string" &&
    ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].includes(value)
  );
}
