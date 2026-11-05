import assert from "node:assert/strict";
import { test } from "node:test";
import { hasScheduleInk, scheduleImageGrid } from "../src/lib/schedule-image-grid";

test("image tables retain all eight columns and employee row boundaries", () => {
  const width = 900, height = 650;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const pixel = (x: number, y: number, shade = 170) => data.set([shade, shade, shade, 255], (y * width + x) * 4);
  const rows = [100, 130, 185, 245, 310, 370, 430, 490, 550];
  const columns = Array.from({ length: 9 }, (_, i) => 50 + i * 100);
  for (const y of rows) for (let x = 50; x <= 850; x++) pixel(x, y);
  for (const x of columns) for (let y = 100; y <= 550; y++) pixel(x, y);
  assert.deepEqual(scheduleImageGrid({ width, height, data }), { columns, rows });
  assert.equal(hasScheduleInk({ width, height, data }, 156, 136, 244, 179), false);
  for (let x = 160; x < 180; x++) pixel(x, 144, 0);
  assert.equal(hasScheduleInk({ width, height, data }, 156, 136, 244, 179), true);
});

test("a footer-only page is empty but unrelated body content is never silently skipped", () => {
  const width = 100, height = 100, data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let x = 10; x < 80; x++) data.set([0, 0, 0, 255], (5 * width + x) * 4);
  assert.equal(scheduleImageGrid({ width, height, data }), null);
  assert.equal(hasScheduleInk({ width, height, data }, 0, 10, width, 90), false);
  for (let x = 10; x < 80; x++) data.set([0, 0, 0, 255], (50 * width + x) * 4);
  assert.equal(hasScheduleInk({ width, height, data }, 0, 10, width, 90), true);
});
