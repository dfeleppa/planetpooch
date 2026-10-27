require('tsx/cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { maintenanceCompanyWhere, canAccessMaintenanceCompany } = require('../src/lib/maintenance-access.ts');
const { completeMaintenanceTask, completionPayload } = require('../src/lib/maintenance-task-completion.ts');

const employee = { id: 'resort-worker', role: 'EMPLOYEE', company: 'RESORT' };
test('saved company limits business staff even with CMO title; Corporate supports both', () => {
  for (const role of ['EMPLOYEE', 'MANAGER', 'MARKETING']) {
    for (const company of ['RESORT', 'GROOMING']) {
      const user = { role, company, jobTitle: 'CMO' };
      assert.deepEqual(maintenanceCompanyWhere(user).company.in, [company]);
      assert.equal(canAccessMaintenanceCompany(user, company === 'RESORT' ? 'GROOMING' : 'RESORT'), false);
    }
  }
  assert.deepEqual(maintenanceCompanyWhere({ company: null, role: 'EMPLOYEE' }).company.in, []);
  assert.deepEqual(maintenanceCompanyWhere({ company: 'CORPORATE', role: 'EMPLOYEE' }).company.in, ['RESORT', 'GROOMING']);
  assert.deepEqual(maintenanceCompanyWhere(employee, 'GROOMING').company.in, []);
});

test('completion rejects invalid, negative, fractional, duplicate, and excessive usages', () => {
  for (const quantityUsed of [-20, 0.5, NaN, Infinity, '2', 2147483648]) {
    assert.throws(() => completionPayload({ usages: [{ inventoryItemId: 'stock', quantityUsed }] }));
  }
  assert.throws(() => completionPayload(null));
  assert.throws(() => completionPayload({ usages: [{ inventoryItemId: 'stock', quantityUsed: 1 }, { inventoryItemId: 'stock', quantityUsed: 2 }] }));
  assert.throws(() => completionPayload({ notes: 'x'.repeat(5001) }));
  assert.deepEqual(completionPayload({ usages: [{ inventoryItemId: 'stock', quantityUsed: 0 }] }).usages[0].quantityUsed, 0);
});

// Transactional in-memory fixture with rollback. No live database or secrets.
function fixture({ company = 'RESORT', assignedToId = null, stockCompany = company, stock = 10 } = {}) {
  let state = { task: { id: 'task', company, assignedToId, status: 'PENDING' }, stock, usages: [] };
  let queue = Promise.resolve();
  const matches = where => where.id === state.task.id && (!where.company || where.company.in.includes(state.task.company));
  const tx = {
    maintenanceTask: {
      findUnique: async ({ where }) => matches(where) ? { ...state.task } : null,
      findUniqueOrThrow: async () => ({ ...state.task }),
      updateMany: async ({ where, data }) => {
        if (!matches(where) || state.task.status === 'COMPLETED' || state.task.assignedToId !== where.assignedToId) return { count: 0 };
        Object.assign(state.task, data); return { count: 1 };
      },
    },
    inventoryItem: {
      findUnique: async ({ where }) => where.id === 'stock' && where.company === stockCompany ? { id: 'stock', company: stockCompany } : null,
      updateMany: async ({ where, data }) => {
        if (state.stock < where.currentQuantity.gte) return { count: 0 };
        state.stock -= data.currentQuantity.decrement; return { count: 1 };
      },
    },
    inventoryUsage: { create: async ({ data }) => { state.usages.push(data); } },
  };
  return {
    db: { $transaction(fn) {
      const run = queue.then(async () => {
        const before = structuredClone(state);
        try { return await fn(tx); } catch (e) { state = before; throw e; }
      });
      queue = run.catch(() => {}); return run;
    } },
    state: () => state,
  };
}
const usage = n => ({ usages: [{ inventoryItemId: 'stock', quantityUsed: n }] });
test('cross-company tasks and tasks assigned to another employee cannot be completed', async () => {
  for (const options of [{ company: 'GROOMING' }, { assignedToId: 'another-worker' }]) {
    const f = fixture(options);
    await assert.rejects(() => completeMaintenanceTask(f.db, employee, 'task', usage(2)), e => [403, 404].includes(e.status));
    assert.equal(f.state().stock, 10);
    assert.equal(f.state().task.status, 'PENDING');
  }
});
test('successful completion consumes stock once, including concurrent/repeated submissions', async () => {
  const f = fixture();
  const results = await Promise.all([1, 2, 3].map(() => completeMaintenanceTask(f.db, employee, 'task', usage(2))));
  assert.ok(results.every(task => task.status === 'COMPLETED'));
  assert.equal(f.state().stock, 8);
  assert.equal(f.state().usages.length, 1);
});
test('inventory from another company and insufficient stock roll back completion and all usage writes', async () => {
  for (const options of [{ stockCompany: 'GROOMING' }, { stock: 1 }]) {
    const f = fixture(options);
    await assert.rejects(() => completeMaintenanceTask(f.db, employee, 'task', usage(2)));
    assert.equal(f.state().task.status, 'PENDING');
    assert.equal(f.state().usages.length, 0);
    assert.equal(f.state().stock, options.stock ?? 10);
  }
});
test('zero usage completes normally without creating a stock movement', async () => {
  const f = fixture();
  await completeMaintenanceTask(f.db, employee, 'task', usage(0));
  assert.equal(f.state().stock, 10);
  assert.equal(f.state().usages.length, 0);
});
test('a lost completion claim cannot consume stock', async () => {
  let writes = 0;
  const task = { id: 'task', company: 'RESORT', assignedToId: null, status: 'PENDING' };
  const db = { $transaction: fn => fn({ maintenanceTask: {
    findUnique: async () => task,
    updateMany: async () => { task.status = 'COMPLETED'; return { count: 0 }; },
  }, inventoryItem: { updateMany: async () => { writes++; } } }) };
  assert.equal((await completeMaintenanceTask(db, employee, 'task', usage(2))).status, 'COMPLETED');
  assert.equal(writes, 0);
});

test('actual list/detail/delete APIs enforce company scope and checklist APIs reject Grooming accounts', async () => {
  let user = employee;
  const observed = [];
  const model = {
    findMany: async args => { observed.push(args.where); return []; },
    findUnique: async args => { observed.push(args.where); return null; },
    delete: async () => { throw new Error('Cross-company deletion must not execute'); },
  };
  const original = Module._load;
  Module._load = function(id, ...args) {
    if (id === '@/lib/auth-helpers') return { getSession: async () => ({ user }), isManagerOrAbove: () => true };
    if (id === '@/lib/maintenance-access') return require('../src/lib/maintenance-access.ts');
    if (id === '@/lib/prisma') return { prisma: { maintenanceTask: model, inventoryItem: model, inventoryCategory: model, maintenanceSchedule: model } };
    if (id === '@/lib/maintenance') return {};
    return original.call(this, id, ...args);
  };
  try {
    for (const route of ['tasks', 'inventory', 'inventory-categories', 'schedules']) {
      const { GET } = require(`../src/app/api/maintenance/${route}/route.ts`);
      const response = await GET({ nextUrl: new URL('https://app.planet-pooch.com/api?company=GROOMING') });
      assert.equal(response.status, 200);
      assert.deepEqual(observed.at(-1).company.in, []);
    }
    for (const [route, key] of [['tasks/[taskId]', 'taskId'], ['inventory/[itemId]', 'itemId'], ['schedules/[scheduleId]', 'scheduleId']]) {
      const api = require(`../src/app/api/maintenance/${route}/route.ts`);
      assert.equal((await api.GET({}, { params: Promise.resolve({ [key]: 'foreign' }) })).status, 404);
      assert.deepEqual(observed.at(-1).company.in, ['RESORT']);
      if (api.DELETE) assert.equal((await api.DELETE({}, { params: Promise.resolve({ [key]: 'foreign' }) })).status, 404);
      if (api.PUT) assert.equal((await api.PUT({}, { params: Promise.resolve({ [key]: 'foreign' }) })).status, 404);
    }
    for (const route of ['inventory', 'inventory-categories', 'schedules']) {
      const api = require(`../src/app/api/maintenance/${route}/route.ts`);
      const payload = { name: 'test', title: 'test', categoryId: 'category', company: 'GROOMING', recurrenceInterval: 'WEEKLY', startDate: '2026-10-27' };
      assert.equal((await api.POST({ json: async () => payload })).status, 403);
    }
    const adjust = require('../src/app/api/maintenance/inventory/[itemId]/adjust/route.ts');
    assert.equal((await adjust.POST({}, { params: Promise.resolve({ itemId: 'stock' }) })).status, 403);
    user = { ...employee, role: 'MANAGER' };
    assert.equal((await adjust.POST({}, { params: Promise.resolve({ itemId: 'stock' }) })).status, 404);
    user = { ...employee, company: 'GROOMING' };
    for (const [route, method] of [['checklists', 'GET'], ['checklists/summary', 'GET'], ['checklists/completions', 'POST'], ['checklists/items', 'POST'], ['checklists/items/reorder', 'PUT'], ['checklists/items/[itemId]', 'PATCH']]) {
      const api = require(`../src/app/api/maintenance/${route}/route.ts`);
      assert.equal((await api[method]({}, { params: Promise.resolve({ itemId: 'foreign' }) })).status, 403);
    }
  } finally { Module._load = original; }
});

test('production headers prevent framing and sniffing while preserving supported embeds', async () => {
  const config = require('../next.config.ts').default;
  const rules = await config.headers();
  const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]));
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  const csp = headers['Content-Security-Policy'];
  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) assert.ok(csp.includes(directive));
  assert.ok(csp.includes('https://drive.google.com'));
  assert.ok(csp.includes('https://www.youtube.com'));
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.equal(config.poweredByHeader, false);
});
