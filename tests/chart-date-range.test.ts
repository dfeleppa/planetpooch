import assert from "node:assert/strict";
import test from "node:test";
import { chartPresetRange, yearToDateRange } from "../src/lib/moego/chart-date-range";

test("YTD selects January 1 through today in Eastern time", () => {
  assert.deepEqual(yearToDateRange(new Date("2026-09-16T16:00:00Z")), {
    from: "2026-01-01", to: "2026-09-16",
  });
});

test("YTD handles New Year before and after Eastern midnight", () => {
  assert.deepEqual(yearToDateRange(new Date("2027-01-01T02:00:00Z")), {
    from: "2026-01-01", to: "2026-12-31",
  });
  assert.deepEqual(yearToDateRange(new Date("2027-01-01T05:00:00Z")), {
    from: "2027-01-01", to: "2027-01-01",
  });
});

test("completed calendar presets use Sunday weeks and calendar boundaries", () => {
  const now = new Date("2026-09-21T16:00:00Z");
  assert.deepEqual(chartPresetRange("last-week", now), {
    from: "2026-09-13",
    to: "2026-09-19",
  });
  assert.deepEqual(chartPresetRange("last-month", now), {
    from: "2026-08-01",
    to: "2026-08-31",
  });
  assert.deepEqual(chartPresetRange("last-year", now), {
    from: "2025-01-01",
    to: "2025-12-31",
  });
});

test("rolling presets include today without adding an extra day", () => {
  const now = new Date("2026-09-21T16:00:00Z");
  assert.deepEqual(chartPresetRange("7-days", now), {
    from: "2026-09-15",
    to: "2026-09-21",
  });
});
