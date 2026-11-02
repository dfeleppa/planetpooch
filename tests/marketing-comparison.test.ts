import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonRange } from '../src/app/(marketing)/marketing/ad-reporting/report-range';

test('previous period uses inclusive days across month and year boundaries', () => {
  assert.deepEqual(comparisonRange({ from: '2026-01-01', to: '2026-01-07' }, { compare: 'previous' }), {
    mode: 'previous', from: '2025-12-25', to: '2025-12-31', label: 'Previous period',
  });
});
test('last year clamps leap day to February', () => {
  const range = comparisonRange({ from: '2024-02-29', to: '2024-03-02' }, { compare: 'year' });
  assert.equal(range?.from, '2023-02-28');
  assert.equal(range?.to, '2023-03-02');
});
test('custom dates reject invalid and reversed ranges, and allow one day', () => {
  const report = { from: '2026-10-01', to: '2026-10-30' };
  for (const [compareFrom, compareTo] of [['2026-02-30','2026-03-01'], ['2026-10-02','2026-10-01'], ['', '2026-10-01']]) {
    assert.equal(comparisonRange(report, { compare: 'custom', compareFrom, compareTo }), null);
  }
  assert.equal(comparisonRange(report, { compare: 'custom', compareFrom: '2026-10-01', compareTo: '2026-10-01' })?.from, '2026-10-01');
  assert.equal(comparisonRange(report, { compare: 'unknown' }), null);
});
