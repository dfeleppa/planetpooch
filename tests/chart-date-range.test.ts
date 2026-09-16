import assert from "node:assert/strict";
import test from "node:test";
import { yearToDateRange } from "../src/lib/moego/chart-date-range";

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
