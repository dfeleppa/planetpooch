const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
require('tsx/cjs');

function load(file, deps) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: name => deps[name] ?? require(name), Date, URL, Headers, process };
  vm.runInNewContext(js, context);
  return context.exports;
}
const access = load('src/lib/front-desk-access.ts', {});
const business = load('src/lib/business.ts', {});
const desk = { id: 'desk', role: 'FRONT_DESK', company: 'RESORT' };
const response = { json: (body, options) => ({ body, status: options?.status ?? 200 }),
  next: () => ({ status: 200 }), redirect: url => ({ status: 307, url: String(url) }) };
function route(file, prisma) {
  return load('src/app/api/maintenance/' + file, {
    'next/server': { NextResponse: response }, '@/lib/prisma': { prisma },
    '@/lib/front-desk-access': access,
    '@/lib/maintenance-access': require('../src/lib/maintenance-access.ts'),
    '@/lib/maintenance-task-completion': require('../src/lib/maintenance-task-completion.ts'),
    '@/lib/auth-helpers': { getSession: async () => ({ user: desk }), isManagerOrAbove: () => false },
    '@/lib/maintenance': { calculateNextDueDate: () => null, checkInventorySufficiency: async () => [] },
    '@prisma/client': {},
  });
}

test('real collection handlers force RESORT even when the query requests GROOMING or omits company', async () => {
  for (const [file, model] of [['inventory/route.ts', 'inventoryItem'], ['inventory-categories/route.ts', 'inventoryCategory'], ['schedules/route.ts', 'maintenanceSchedule'], ['tasks/route.ts', 'maintenanceTask']]) {
    let saved;
    const handler = route(file, { [model]: { findMany: async args => { saved = args; return []; } } });
    for (const query of ['', '?company=GROOMING', '?company=CORPORATE']) {
      const result = await handler.GET({ nextUrl: new URL('https://portal.test/api/' + query) });
      assert.equal(result.status, 200);
      assert.deepEqual([...saved.where.company.in], ['RESORT'], file + query);
    }
  }
});

test('real detail handlers return 404 for a grooming record ID', async () => {
  for (const [file, model, key] of [['inventory/[itemId]/route.ts', 'inventoryItem', 'itemId'], ['schedules/[scheduleId]/route.ts', 'maintenanceSchedule', 'scheduleId'], ['tasks/[taskId]/route.ts', 'maintenanceTask', 'taskId']]) {
    const handler = route(file, { [model]: { findUnique: async args => {
      assert.deepEqual([...args.where.company.in], ['RESORT']);
      return null;
    } } });
    assert.equal((await handler.GET({}, { params: Promise.resolve({ [key]: 'grooming-record' }) })).status, 404);
  }
});

test('task completion rejects other business tasks and inventory before writing', async () => {
  let writes = 0;
  for (const [allowedTask, expected] of [[false, 404], [true, 400]]) {
    const tx = {
      maintenanceTask: {
        findUnique: async args => {
          assert.deepEqual([...args.where.company.in], ['RESORT']);
          return allowedTask ? { id: 'task', company: 'RESORT', status: 'PENDING', assignedToId: null } : null;
        },
        updateMany: async () => ({ count: 1 }),
      },
      inventoryItem: { findUnique: async args => { assert.equal(args.where.company, 'RESORT'); return null; } },
    };
    const handler = route('tasks/[taskId]/complete/route.ts', {
      $transaction: async fn => { const result = await fn(tx); writes++; return result; },
    });
    const result = await handler.POST({ json: async () => ({ usages: [{ inventoryItemId: 'grooming-stock', quantityUsed: 1 }] }) }, { params: Promise.resolve({ taskId: 'task' }) });
    assert.equal(result.status, expected);
  }
  assert.equal(writes, 0);
});

test('proxy rejects real direct requests for employee and corporate pages and APIs', async () => {
  const handler = load('src/proxy.ts', {
    'next/server': { NextResponse: response }, 'next-auth/jwt': { getToken: async () => desk },
    '@/lib/front-desk-access': access, '@/lib/business': business,
    '@/lib/knowledge-owner': { isKnowledgeOwner: () => false },
  });
  for (const pathname of ['/dashboard', '/admin/people', '/admin/employees', '/finance/payroll', '/maintenance/vans/6']) {
    const req = { url: 'https://portal.test' + pathname, nextUrl: new URL('https://portal.test' + pathname), method: 'GET' };
    const result = await handler.proxy(req);
    assert.equal(result.status, 307, pathname);
    assert.equal(result.url, 'https://portal.test/maintenance/checklists?company=RESORT');
  }
  for (const pathname of ['/api/employees', '/api/finance/payroll', '/api/knowledge/chat', '/api/business', '/api/maintenance/vans/6']) {
    assert.equal((await handler.proxy({ url: 'https://portal.test' + pathname, nextUrl: new URL('https://portal.test' + pathname), method: 'GET' })).status, 403, pathname);
  }
});
