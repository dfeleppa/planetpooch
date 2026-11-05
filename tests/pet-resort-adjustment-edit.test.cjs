const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/app/api/cash-management/pet-resort-adjustments/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(existing, available, authorized = true) {
  let updated;
  const tx = {
    $queryRaw: async () => [],
    financePetResortCashAdjustment: { findUnique: async () => existing, aggregate: async () => ({ _sum: { amountCents: 0 } }), update: async ({ data }) => { updated = data; } },
    financePetResortCashTransaction: { aggregate: async () => ({ _sum: { amountCents: available } }) },
    financePetResortDailyCash: { aggregate: async () => ({ _sum: { amountCents: 0 } }) },
    financeCashBankDeposit: { aggregate: async () => ({ _sum: { amountCents: 0 } }) },
  };
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' }, PrismaClientKnownRequestError: class extends Error {} } },
    '@/lib/auth-helpers': { getSession: async () => ({ user: { id: 'admin', role: 'admin' } }), isSuperAdmin: () => authorized },
    '@/lib/prisma': { prisma: { $transaction: async (fn) => fn(tx) } },
    '@/lib/cash-management': { PET_RESORT_SOURCE: 'pet-resort', petResortOnHandCents: (a,b,c,d) => a+b-c+d },
  };
  const context = { exports: {}, require: (name) => deps[name] ?? require(name) };
  vm.runInNewContext(source, context);
  return { patch: context.exports.PATCH, updated: () => updated };
}
const request = (changes = {}) => ({ json: async () => ({ id: 'entry', direction: 'remove', amountCents: 21000, note: 'corrected', original: { amountCents: -20000, note: 'old' }, ...changes }) });
test('editing an adjustment saves a signed amount and reason', async () => {
  const app = setup({ amountCents: -20000, note: 'old' }, 1000);
  assert.equal((await app.patch(request())).status, 200);
  assert.equal(app.updated().amountCents, -21000);
  assert.equal(app.updated().note, 'corrected');
});
test('rejects stale edits and balance reductions beyond cash on hand', async () => {
  const stale = setup({ amountCents: -19000, note: 'old' }, 10000);
  assert.equal((await stale.patch(request())).status, 409);
  const overdraw = setup({ amountCents: -20000, note: 'old' }, 999);
  assert.equal((await overdraw.patch(request())).status, 409);
  assert.equal(overdraw.updated(), undefined);
  const flip = setup({ amountCents: 20000, note: 'old' }, 40999);
  assert.equal((await flip.patch(request({ original: { amountCents: 20000, note: 'old' } }))).status, 409);
});
test('rejects unauthorized edits', async () => {
  const app = setup({ amountCents: -20000, note: 'old' }, 1000, false);
  assert.equal((await app.patch(request())).status, 401);
});
