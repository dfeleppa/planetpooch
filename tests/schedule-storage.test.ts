import assert from "node:assert/strict";
import { test } from "node:test";
import { canManageResortSchedules, preferredScheduleWeek, savedScheduleInput, scheduleWeekStart, type SavedScheduleSummary } from "../src/lib/schedule-storage";
import type { WeeklySchedule } from "../src/lib/schedule-formatter";

const schedule: WeeklySchedule = {
  title: "Week of November 8, 2026 - November 14, 2026",
  days: ["Sun 8", "Mon 9", "Tue 10", "Wed 11", "Thu 12", "Fri 13", "Sat 14"],
  shifts: [{ id: "1", employee: "Example, Alex", day: 0, start: 360, end: 720 }], warnings: [],
};
const summary = (weekStart: string): SavedScheduleSummary => ({ weekStart, title: weekStart, updatedAt: "", revision: 1 });

test("saved schedules are keyed to the printed Sunday date, including year boundaries", () => {
  assert.equal(scheduleWeekStart(schedule), "2026-11-08");
  assert.equal(scheduleWeekStart({ ...schedule, title: "Week of December 27, 2026 - January 2, 2027", days: ["Sun 27", "Mon 28", "Tue 29", "Wed 30", "Thu 31", "Fri 1", "Sat 2"] }), "2026-12-27");
  assert.throws(() => scheduleWeekStart({ ...schedule, title: "Week of February 30, 2026 - March 8, 2026" }), /invalid/);
  assert.throws(() => scheduleWeekStart({ ...schedule, days: ["Sun 1", ...schedule.days.slice(1)] }), /day columns/);
  assert.throws(() => scheduleWeekStart({ ...schedule, title: "Week of November 9, 2026 - November 15, 2026" }), /Sunday/);
  assert.throws(() => scheduleWeekStart({ ...schedule, title: "Unknown week" }), /readable/);
});

test("reload prefers current week, then nearest upcoming week, then most recent past week", () => {
  const weeks = [summary("2026-11-15"), summary("2026-11-01"), summary("2026-11-08")];
  assert.equal(preferredScheduleWeek(weeks, "2026-11-05"), "2026-11-01");
  assert.equal(preferredScheduleWeek(weeks, "2026-11-14"), "2026-11-08");
  assert.equal(preferredScheduleWeek(weeks, "2026-10-30"), "2026-11-01");
  assert.equal(preferredScheduleWeek(weeks, "2026-11-30"), "2026-11-15");
  assert.equal(preferredScheduleWeek([], "2026-11-05"), undefined);
});

test("only Resort managers and corporate managers/super admins can read and save schedules", () => {
  for (const company of ["RESORT", "CORPORATE"]) assert.equal(canManageResortSchedules({ role: "MANAGER", company }), true);
  assert.equal(canManageResortSchedules({ role: "SUPER_ADMIN", company: "GROOMING" }), true);
  for (const user of [undefined, { role: "MANAGER", company: "GROOMING" }, { role: "EMPLOYEE", company: "CORPORATE" }, { role: "FRONT_DESK", company: "RESORT" }]) assert.equal(canManageResortSchedules(user), false);
});

test("stored payload validates shape, limits, and expected revision", () => {
  assert.ok(savedScheduleInput.safeParse({ schedule, expectedRevision: null }).success);
  assert.ok(savedScheduleInput.safeParse({ schedule, expectedRevision: 2 }).success);
  assert.equal(savedScheduleInput.safeParse({ schedule, expectedRevision: 0 }).success, false);
  assert.equal(savedScheduleInput.safeParse({ schedule: { ...schedule, shifts: [{ ...schedule.shifts[0], employee: "" }] }, expectedRevision: 1 }).success, false);
  assert.equal(savedScheduleInput.safeParse({ schedule: { ...schedule, shifts: Array(1001).fill(schedule.shifts[0]) }, expectedRevision: null }).success, false);
});
