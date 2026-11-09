/* eslint-disable @typescript-eslint/no-require-imports -- Isolate route tests from live services. */
require('tsx/cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');

test('mobile adjustment edits and deletes enforce authorization, stale values, and available cash', async () => {
  const load = Module._load;
  let authorized = true;
  let entry = { id: 'cash-1', amountCents: -70800, note: 'Rest of deposit' };
  let writes = 0;
  const aggregate = (key, value) => ({ aggregate: async () => ({ _sum: { [key]: value } }) });
  const tx = {
    $queryRaw: async () => [],
    financeMobileGroomingWeeklyCloseout: aggregate('finalDepositCents', 100000),
    financeMobileGroomingDailyReconciliation: aggregate('countedCashCents', 0),
    financeCashBankDeposit: aggregate('amountCents', 0),
    financeMobileGroomingCashAdjustment: {
      findUnique: async () => entry,
      aggregate: async () => ({ _sum: { amountCents: entry?.amountCents ?? 0 } }),
      update: async ({ data }) => { writes++; entry = { ...entry, ...data }; },
      delete: async () => { writes++; entry = null; },
    },
  };
  Module._load = function(id, ...args) {
    if (id === '@/lib/auth-helpers') return { getSession: async () => authorized ? { user: { id: 'admin', role: 'SUPER_ADMIN' } } : null, isSuperAdmin: () => authorized };
    if (id === '@/lib/prisma') return { prisma: { $transaction: async (fn) => fn(tx) } };
    return load.call(this, id, ...args);
  };
  try {
    const { PATCH, DELETE } = require('../src/app/api/cash-management/mobile-grooming-adjustments/route.ts');
    const body = () => ({ id: 'cash-1', direction: 'remove', amountCents: 50000, note: 'Corrected deposit', original: { amountCents: entry.amountCents, note: entry.note } });
    const request = (data) => ({ json: async () => data });
    authorized = false;
    assert.equal((await DELETE(request(body()))).status, 401);
    authorized = true;
    assert.equal((await PATCH(request({ ...body(), amountCents: 0 }))).status, 400);
    assert.equal((await PATCH(request({ ...body(), original: { amountCents: 1, note: 'stale' } }))).status, 409);
    assert.equal((await PATCH(request({ ...body(), amountCents: 200000 }))).status, 409);
    assert.equal(writes, 0);
    assert.equal((await PATCH(request(body()))).status, 200);
    assert.equal(entry.amountCents, -50000);
    assert.equal(entry.note, 'Corrected deposit');
    assert.equal((await DELETE(request(body()))).status, 200);
    assert.equal(entry, null);
    entry = { id: 'cash-1', amountCents: 50000, note: 'Added cash' };
    tx.financeCashBankDeposit = aggregate('amountCents', 125000);
    assert.equal((await DELETE(request(body()))).status, 409);
    assert.equal(writes, 2);
  } finally { Module._load = load; }
});
