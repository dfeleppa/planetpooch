/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader interception isolates route tests from live services. */
require('tsx/cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

test('campaign and LSA routes reject invalid uploads before changing saved reports', async () => {
  const original = Module._load;
  let writes = 0;
  const forbiddenWrite = () => { writes++; throw new Error('Invalid import must not write'); };
  Module._load = function(id, ...args) {
    if (id === '@/lib/auth-helpers') return { getSession: async () => ({ user: { role: 'ADMIN' } }), hasMarketingAccess: () => true };
    if (id === '@/lib/prisma') return { prisma: new Proxy({}, { get: () => new Proxy(forbiddenWrite, { get: () => forbiddenWrite }) }) };
    if (id === '@/lib/marketing/google-lsa-leads') return { GOOGLE_LSA_LEAD_COST_CENTS: 2800 };
    return original.call(this, id, ...args);
  };
  try {
    for (const [route, max] of [['google-campaign-report', 4_000_000], ['google-lsa-lead-report', 2_000_000]]) {
      const { POST } = require(`../src/app/api/finance/${route}/route.ts`);
      for (const [name, content, status, expected] of [
        ['export.csv', new Uint8Array(max + 1), 413, /MB or smaller/],
        ['export.xlsx', 'not a CSV', 400, /CSV file/],
        ['export.csv', '', 400, /empty/],
        ['export.csv', 'Wrong,Headers\nhello,world', 400, /rows/],
      ]) {
        const form = new FormData();
        form.set('business', 'pet-resort');
        form.set('periodStart', '2026-10-01');
        form.set('periodEnd', '2026-10-31');
        form.set('file', new File([content], name, { type: 'text/csv' }));
        const response = await POST({ formData: async () => form });
        assert.equal(response.status, status, `${route}: ${name}`);
        assert.match((await response.json()).error, expected);
      }
    }
    assert.equal(writes, 0);
  } finally { Module._load = original; }
});
