import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageRows, employeeLabels, parseSchedule, validateShifts, type SchedulePage, type ScheduleShift } from "../src/lib/schedule-formatter";
import { buildSchedulePdf } from "../src/lib/schedule-pdf";
import { PDFDocument } from "pdf-lib";

const shift = (employee: string, start: number, end: number, day = 0): ScheduleShift => ({ id: `${employee}-${day}-${start}`, employee, start, end, day });
function source(): SchedulePage {
  const item = (text: string, x: number, y: number) => ({ text, x, y, width: 40, height: 8 });
  return { width: 800, height: 600, items: [
    item("Week of November 8, 2026 - November 14, 2026", 30, 550),
    ...["Sun 8", "Mon 9", "Tue 10", "Wed 11", "Thu 12", "Fri 13", "Sat 14"].map((name, i) => item(name, 150 + i * 90, 520)),
    item("Example, Alex", 30, 490), item("7:30 AM - 12:30 PM", 145, 491),
    item("Wrapped, Rebec", 30, 460), item("ca", 30, 450), item("1:39 PM - 7:00 PM", 235, 461),
    item("Absent, Pat", 30, 420), item("PTO", 325, 421),
  ] };
}

test("ADP cells preserve blank days, wrapped names, exact times and nonworking annotations", () => {
  const schedule = parseSchedule([source()]);
  assert.equal(schedule.shifts.length, 2);
  assert.deepEqual(schedule.shifts.map(({ employee, day, start, end }) => ({ employee, day, start, end })), [
    { employee: "Example, Alex", day: 0, start: 450, end: 750 },
    { employee: "Wrapped, Rebecca", day: 1, start: 819, end: 1140 },
  ]);
  assert.equal(schedule.warnings.length, 2);
});

test("coverage splits only at hour boundaries and actual shift transitions, with exclusive ends", () => {
  const rows = coverageRows([shift("One, Alex", 360, 450), shift("Two, Sam", 450, 510), shift("Three, Pat", 459, 480, 1)]);
  assert.deepEqual(rows.map(row => [row.start, row.end]), [[360, 420], [420, 450], [450, 459], [459, 480], [480, 510]]);
  assert.deepEqual(rows[2].employees[0], ["Two, Sam"]);
  assert.equal(rows[2].employees[1].length, 0);
  assert.deepEqual(rows[3].employees[1], ["Three, Pat"]);
  assert.equal(rows[4].employees[1].length, 0);
  // Coverage integral must equal all scheduled labor minutes.
  assert.equal(rows.reduce((total, row) => total + row.employees.reduce((sum, people) => sum + people.length * (row.end - row.start), 0), 0), 171);
});

test("duplicate, overlapping, zero-length, and cross-week shifts are rejected", () => {
  assert.throws(() => validateShifts([shift("One, Alex", 360, 480), shift("one, alex", 450, 500)]), /Overlapping/);
  assert.throws(() => validateShifts([shift("One, Alex", 360, 360)]), /valid/);
  assert.throws(() => validateShifts([shift("One, Alex", 1380, 1500, 6)]), /next week/);
  assert.doesNotThrow(() => validateShifts([shift("One, Alex", 360, 480), shift("One, Alex", 480, 500)]));
});

test("overnight work is counted on the following calendar day", () => {
  const rows = coverageRows([shift("One, Alex", 1380, 1500)]);
  assert.deepEqual(rows[0].employees[1], ["One, Alex"]);
  assert.deepEqual(rows.at(-1)?.employees[0], ["One, Alex"]);
  assert.throws(() => validateShifts([shift("One, Alex", 1380, 1500), shift("One, Alex", 30, 90, 1)]), /Overlapping/);
});

test("unreadable pages, multiple weeks, and duplicate repeated pages fail instead of omitting shifts", () => {
  assert.throws(() => parseSchedule([{ width: 800, height: 600, items: [] }]), /readable/);
  const other = source(); other.items[0].text = "Week of November 15, 2026 - November 21, 2026";
  assert.throws(() => parseSchedule([source(), other]), /different weeks/);
  assert.throws(() => parseSchedule([source(), source()]), /duplicate/);
});

test("abbreviated name collisions remain distinguishable", () => {
  const labels = employeeLabels([shift("Smith, Alex", 360, 480), shift("Stone, Alex", 360, 480)]);
  assert.equal(labels.get("Smith, Alex"), "Smith, Alex");
  assert.equal(labels.get("Stone, Alex"), "Stone, Alex");
});

test("PDF has exactly one landscape page, and excessive detail is rejected", async () => {
  const schedule = parseSchedule([source()]);
  const pdf = await PDFDocument.load(await buildSchedulePdf(schedule));
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(pdf.getPage(0).getWidth() > pdf.getPage(0).getHeight());
  await assert.rejects(() => buildSchedulePdf({ ...schedule, shifts: Array.from({ length: 100 }, (_, i) => shift(`Longemployee${i}, Person${i}`, 360, 1200)) }), /too much detail/);
});
