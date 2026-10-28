const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
require('tsx/cjs');

function load(file, prisma = {}, manager = true, userOverride = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/prisma': { prisma },
    '@/lib/auth-helpers': { getSession: async () => ({ user: { id: 'staff', company: 'RESORT', role: manager ? 'MANAGER' : 'EMPLOYEE', ...userOverride } }), isManagerOrAbove: () => manager },
    '@/lib/maintenance-access': require('../src/lib/maintenance-access.ts'),
    '@/lib/checklist-access': require('../src/lib/checklist-access.ts'),
  };
  const context = { exports: {}, require: (name) => deps[name] ?? require(name), Date };
  vm.runInNewContext(js, context);
  return context.exports;
}
const base = 'src/app/api/maintenance/checklists/';
const request = (body) => ({ json: async () => body });

test('weekly sign-offs and unchecks use Sunday; daily sign-offs retain their selected day', async () => {
  for (const period of ['WEEKLY', 'AM', 'PM']) {
    for (const completed of [true, false]) {
      let saved;
      const route = load(base + 'completions/route.ts', {
        dailyChecklistItem: { findUnique: async () => ({ period, department: "BOARDING" }) },
        dailyChecklistCompletion: {
          deleteMany: async (args) => { saved = args.where; return { count: 1 }; },
          upsert: async (args) => {
            saved = args.create;
            return { completedAt: new Date(), completedBy: { name: 'Staff' } };
          },
        },
      });
      const result = await route.POST(request({ itemId: 'task', date: '2026-10-27', completed }));
      assert.equal(result.status, 200);
      assert.equal(saved.date.toISOString().slice(0, 10), period === 'WEEKLY' ? '2026-10-25' : '2026-10-27');
    }
  }
});

test('Wednesday reads weekly Sunday history without marking daily Sunday work complete', async () => {
  const completion = { date: new Date('2026-10-25'), completedAt: new Date(), completedBy: { name: 'Staff' } };
  const route = load(base + 'route.ts', {
    dailyChecklistItem: { findMany: async () => [
      { id: 'weekly', period: 'WEEKLY', isActive: false, completions: [completion] },
      { id: 'daily', period: 'AM', isActive: true, completions: [completion] },
      { id: 'removed-daily', period: 'AM', isActive: false, completions: [completion] },
    ] },
  });
  const result = await route.GET({ nextUrl: new URL('https://example.com?date=2026-10-28') });
  assert.equal(result.body.items.length, 2);
  assert.equal(result.body.items[0].completion.completedByName, 'Staff');
  assert.equal(result.body.items[1].completion, null);
});

test('weekly completions do not inflate daily progress', async () => {
  const route = load(base + 'summary/route.ts', {
    dailyChecklistItem: { groupBy: async () => ['AM', 'PM', 'WEEKLY'].map((period) => ({ period, _count: { _all: 1 } })) },
    dailyChecklistCompletion: { findMany: async () => ['AM', 'WEEKLY'].map((period) => ({ item: { period }, date: new Date('2026-10-25') })) },
  });
  const result = await route.GET({ nextUrl: new URL('https://example.com?start=2026-10-25&end=2026-10-31') });
  assert.equal(result.body.amTotal, 1);
  assert.equal(result.body.pmTotal, 1);
  assert.equal(result.body.days['2026-10-25'].amDone, 1);
  assert.equal(result.body.days['2026-10-25'].pmDone, 0);
});

test('only managers can create weekly items', async () => {
  let created = false;
  const prisma = { dailyChecklistItem: {
    aggregate: async () => ({ _max: { order: 2 } }),
    create: async ({ data }) => { created = true; return data; },
  } };
  const body = { period: 'WEEKLY', title: 'Weekly task' };
  const forbidden = await load(base + 'items/route.ts', prisma, false).POST(request(body));
  assert.equal(forbidden.status, 403);
  assert.equal(created, false);
  const allowed = await load(base + 'items/route.ts', prisma).POST(request(body));
  assert.equal(allowed.status, 201);
  assert.equal(allowed.body.period, 'WEEKLY');
  assert.equal(allowed.body.order, 3);
});

test('date strip renders exactly Sunday through Saturday across year and daylight-saving boundaries', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/app/(maintenance)/maintenance/checklists/ChecklistBoard.tsx'), 'utf8');
  const js = ts.transpileModule(source + '\nexport { DateStrip, addDays, parseDate };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, require: (name) => {
    if (name === '@/lib/utils') return { cn: (...args) => args.filter(Boolean).join(' ') };
    if (name.startsWith('@/')) return {};
    if (name === 'next-auth/react') return {};
    return require(name);
  }, Date };
  vm.runInNewContext(js, context);
  const { DateStrip, addDays, parseDate } = context.exports;
  for (const selected of ['2027-01-01', '2026-11-01', '2026-03-08', '2026-10-27']) {
    const start = addDays(selected, -parseDate(selected).getDay());
    const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    assert.equal(parseDate(dates[0]).getDay(), 0);
    assert.equal(parseDate(dates[6]).getDay(), 6);
    assert.equal(addDays(addDays(selected, -7), 7), selected);
    for (const weekly of [true, false]) {
      const html = renderToStaticMarkup(React.createElement(DateStrip, {
        dates, selected, today: '2026-10-27', weekly, summary: null, onSelect() {},
      }));
      assert.equal((html.match(/aria-pressed=/g) ?? []).length, 7);
      assert.ok(html.includes('aria-label="Previous week"'));
      assert.ok(html.includes('aria-label="Next week"'));
      assert.ok(html.indexOf('>Sun<') < html.indexOf('>Sat<'));
      assert.ok(!html.includes('overflow-x-auto'));
      assert.ok(!html.includes('text-white') || !weekly);
    }
  }
});

test('only the signer can uncheck daily and weekly tasks, including orphaned sign-offs', async () => {
  for (const period of ['AM', 'PM', 'WEEKLY']) {
    for (const owner of ['staff', 'other', null, 'absent']) {
      let remaining = owner === 'absent' ? null : { completedById: owner };
      const route = load(base + 'completions/route.ts', {
        dailyChecklistItem: { findUnique: async () => ({ period, department: "BOARDING" }) },
        dailyChecklistCompletion: {
          deleteMany: async ({ where }) => {
            assert.equal(where.completedById, 'staff');
            assert.equal(where.date.toISOString().slice(0, 10), period === 'WEEKLY' ? '2026-10-25' : '2026-10-27');
            if (remaining?.completedById === where.completedById) {
              remaining = null;
              return { count: 1 };
            }
            return { count: 0 };
          },
          findUnique: async () => remaining,
        },
      });
      const result = await route.POST(request({ itemId: 'task', date: '2026-10-27', completed: false }));
      assert.equal(result.status, owner === 'staff' || owner === 'absent' ? 200 : 403);
      assert.equal(remaining === null, owner === 'staff' || owner === 'absent');
    }
  }
});

test('department filters isolate task reads, creation, ordering and progress', async () => {
  for (const department of ['BOARDING', 'GROOMING', 'FRONT_DESK']) {
    const seen = [];
    const prisma = {
      dailyChecklistItem: {
        findMany: async (args) => { seen.push(args.where.department); return []; },
        aggregate: async (args) => { seen.push(args.where.department); return { _max: { order: 0 } }; },
        create: async ({ data }) => { seen.push(data.department); return data; },
        updateMany: async (args) => { seen.push(args.where.department); return { count: 1 }; },
        groupBy: async (args) => { seen.push(args.where.department); return []; },
      },
      dailyChecklistCompletion: { findMany: async (args) => { seen.push(args.where.item.department); return []; } },
      $transaction: async (ops) => Promise.all(ops),
    };
    await load(base + 'route.ts', prisma).GET({ nextUrl: new URL(`https://example.com?date=2026-10-28&department=${department}`) });
    await load(base + 'summary/route.ts', prisma).GET({ nextUrl: new URL(`https://example.com?start=2026-10-25&end=2026-10-31&department=${department}`) });
    await load(base + 'items/route.ts', prisma).POST(request({ department, period: 'AM', title: 'Task' }));
    await load(base + 'items/reorder/route.ts', prisma).PUT(request({ department, period: 'AM', orderedIds: ['task'] }));
    assert.equal(seen.length, 6);
    assert.ok(seen.every((value) => value === department));
  }
});

test('invalid departments are rejected before database access', async () => {
  const result = await load(base + 'items/route.ts').POST(request({ department: 'OTHER', period: 'AM', title: 'Task' }));
  assert.equal(result.status, 400);
});

test('scheduled weekly tasks retain the oldest missed week until completed', async () => {
  for (const done of [[], ['2026-10-18'], ['2026-10-18', '2026-10-25']]) {
    const route = load(base + 'route.ts', { dailyChecklistItem: { findMany: async () => [{
      id: 'weekly', period: 'WEEKLY', dueWeekday: 2, weeklyScheduledAt: new Date('2026-10-20T16:00:00Z'),
      isActive: true, completions: done.map((date) => ({ date: new Date(date), completedAt: new Date(), completedById: 'staff' })),
    }] } });
    const result = await route.GET({ nextUrl: new URL('https://example.com?date=2026-11-04') });
    assert.equal(result.body.items[0].completionDate, ['2026-10-18', '2026-10-25', '2026-11-01'][done.length]);
    assert.equal(result.body.items[0].completion, null);
  }
});

test('weekly due day changes reject invalid days and daily tasks', async () => {
  for (const dueWeekday of [-1, 7, 1.5, 'Monday']) {
    const result = await load(base + 'items/[itemId]/route.ts').PATCH(request({ dueWeekday }), { params: Promise.resolve({ itemId: 'task' }) });
    assert.equal(result.status, 400);
  }
  const result = await load(base + 'items/[itemId]/route.ts', { dailyChecklistItem: { findUnique: async () => ({ period: 'AM' }) } }).PATCH(request({ dueWeekday: 2 }), { params: Promise.resolve({ itemId: 'task' }) });
  assert.equal(result.status, 400);
});

const access = require('../src/lib/checklist-access.ts');
const groomingIds = ['cmobz2cwb0007k0041qnobqcz', 'cmoc04aqt000njr04ehczgndc', 'cmtxaffs40001l2042xiq3yrs'];
test('Corporate can view and edit every checklist regardless of role', () => {
  for (const role of ['EMPLOYEE', 'MANAGER', 'SUPER_ADMIN']) {
    const user = { id: 'corporate', company: 'CORPORATE', role };
    assert.deepEqual([...access.checklistDepartments(user)], ['BOARDING', 'GROOMING', 'FRONT_DESK']);
    assert.equal(access.canEditChecklists(user), true);
  }
});
test('named Grooming staff get Grooming only and no configuration permissions even with manager role', async () => {
  for (const id of groomingIds) {
    for (const company of ['RESORT', 'GROOMING']) {
      const user = { id, company, role: 'MANAGER' };
      assert.deepEqual([...access.checklistDepartments(user)], ['GROOMING']);
      assert.equal(access.canEditChecklists(user), false);
      for (const department of ['BOARDING', 'FRONT_DESK']) {
        const route = load(base + 'route.ts', {}, true, user);
        const result = await route.GET({ nextUrl: new URL(`https://example.com?date=2026-10-28&department=${department}`) });
        assert.equal(result.status, 403);
        const summary = await load(base + 'summary/route.ts', {}, true, user).GET({ nextUrl: new URL(`https://example.com?start=2026-10-25&end=2026-10-31&department=${department}`) });
        assert.equal(summary.status, 403);
      }
      assert.equal((await load(base + 'items/route.ts', {}, true, user).POST(request({ department: 'GROOMING', period: 'AM', title: 'No' }))).status, 403);
      assert.equal((await load(base + 'items/reorder/route.ts', {}, true, user).PUT(request({ department: 'GROOMING', period: 'AM', orderedIds: [] }))).status, 403);
      for (const method of ['PATCH', 'DELETE']) {
        const result = await load(base + 'items/[itemId]/route.ts', {}, true, user)[method](request({ title: 'No' }), { params: Promise.resolve({ itemId: 'task' }) });
        assert.equal(result.status, 403);
      }
    }
  }
});
test('Grooming-only staff cannot complete tasks in other departments by guessing item IDs', async () => {
  for (const department of ['BOARDING', 'FRONT_DESK', 'GROOMING']) {
    let saved = false;
    const route = load(base + 'completions/route.ts', {
      dailyChecklistItem: { findUnique: async () => ({ department, period: 'AM' }) },
      dailyChecklistCompletion: { upsert: async () => { saved = true; return { completedAt: new Date(), completedById: groomingIds[0] }; } },
    }, false, { id: groomingIds[0], company: 'GROOMING', role: 'EMPLOYEE' });
    const result = await route.POST(request({ itemId: 'task', date: '2026-10-27', completed: true }));
    assert.equal(result.status, department === 'GROOMING' ? 200 : 403);
    assert.equal(saved, department === 'GROOMING');
  }
});
test('account names and business selection cannot impersonate assigned Grooming staff', () => {
  assert.deepEqual([...access.checklistDepartments({ id: 'unrelated', name: 'Stacey Conti', company: 'GROOMING', role: 'EMPLOYEE' })], []);
});

test('Corporate employees can create checklist tasks without a manager role', async () => {
  const route = load(base + 'items/route.ts', { dailyChecklistItem: {
    aggregate: async () => ({ _max: { order: 0 } }), create: async ({ data }) => data,
  } }, false, { company: 'CORPORATE', role: 'EMPLOYEE' });
  const result = await route.POST(request({ department: 'FRONT_DESK', period: 'AM', title: 'Corporate task' }));
  assert.equal(result.status, 201);
});

test('Grooming staff can read Grooming tasks and summaries', async () => {
  const user = { id: groomingIds[0], company: 'GROOMING', role: 'EMPLOYEE' };
  const route = load(base + 'route.ts', { dailyChecklistItem: { findMany: async ({ where }) => {
    assert.equal(where.department, 'GROOMING'); return [];
  } } }, false, user);
  assert.equal((await route.GET({ nextUrl: new URL('https://example.com?date=2026-10-28&department=GROOMING') })).status, 200);
  const summary = load(base + 'summary/route.ts', {
    dailyChecklistItem: { groupBy: async () => [] }, dailyChecklistCompletion: { findMany: async () => [] },
  }, false, user);
  assert.equal((await summary.GET({ nextUrl: new URL('https://example.com?start=2026-10-25&end=2026-10-31&department=GROOMING') })).status, 200);
});
