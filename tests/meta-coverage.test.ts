import test from "node:test";
import assert from "node:assert/strict";
import { coversMetaPeriod } from "../src/lib/marketing/meta-coverage";

const day = (value: string) => new Date(`${value}T00:00:00Z`);

test("requires successful sync coverage for every day, including zero-ad days", () => {
  const from = day("2026-10-01");
  const toExclusive = day("2026-10-06");
  assert.equal(coversMetaPeriod(from, toExclusive, [
    { since: day("2026-10-01"), until: day("2026-10-02") },
    { since: day("2026-10-04"), until: day("2026-10-05") },
  ]), false);
  assert.equal(coversMetaPeriod(from, toExclusive, [
    { since: day("2026-10-04"), until: day("2026-10-05") },
    { since: day("2026-10-01"), until: day("2026-10-03") },
  ]), true);
});
