import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, parseEasternDateStart, resolveSubmissionDateRange } from "../src/lib/marketing/submission-date-range";

test("Eastern date boundaries honor daylight saving time", () => {
  assert.equal(parseEasternDateStart("2026-01-15")?.toISOString(), "2026-01-15T05:00:00.000Z");
  assert.equal(parseEasternDateStart("2026-07-15")?.toISOString(), "2026-07-15T04:00:00.000Z");
});

test("date ranges are inclusive and default to 30 calendar days", () => {
  const range = resolveSubmissionDateRange(undefined, undefined, new Date("2026-09-22T18:00:00Z"));
  assert.deepEqual({ start: range.start, end: range.end }, { start: "2026-08-24", end: "2026-09-22" });
  assert.equal(range.endBefore.toISOString(), "2026-09-23T04:00:00.000Z");
});

test("invalid dates fall back and reversed dates are normalized", () => {
  const now = new Date("2026-09-22T18:00:00Z");
  assert.equal(resolveSubmissionDateRange("bad", "2026-02-30", now).start, "2026-08-24");
  assert.deepEqual(
    (({ start, end }) => ({ start, end }))(resolveSubmissionDateRange("2026-09-20", "2026-09-01", now)),
    { start: "2026-09-01", end: "2026-09-20" },
  );
  assert.equal(addCalendarDays("2026-02-28", 1), "2026-03-01");
});
