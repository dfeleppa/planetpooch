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
    '@/lib/auth-helpers': { getSession: async () => ({ user: { id: 'staff', company: manager ? 'CORPORATE' : 'RESORT', role: manager ? 'MANAGER' : 'EMPLOYEE', ...userOverride } }), isManagerOrAbove: () => manager },
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
  for (const period of ['WEEKLY', 'DAILY']) {
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
      { id: 'daily', period: 'DAILY', isActive: true, completions: [completion] },
      { id: 'removed-daily', period: 'DAILY', isActive: false, completions: [completion] },
    ] },
  });
  const result = await route.GET({ nextUrl: new URL('https://example.com?date=2026-10-28') });
  assert.equal(result.body.items.length, 2);
  assert.equal(result.body.items[0].completion.completedByName, 'Staff');
  assert.equal(result.body.items[1].completion, null);
});

test('weekly completions do not inflate daily progress', async () => {
  const route = load(base + 'summary/route.ts', {
    dailyChecklistItem: { groupBy: async () => ['DAILY', 'WEEKLY'].map((period) => ({ period, _count: { _all: 1 } })) },
    dailyChecklistCompletion: { findMany: async () => ['DAILY', 'WEEKLY'].map((period) => ({ item: { period }, date: new Date('2026-10-25') })) },
  });
  const result = await route.GET({ nextUrl: new URL('https://example.com?start=2026-10-25&end=2026-10-31') });
  assert.equal(result.body.dailyTotal, 1);
  assert.equal(result.body.days['2026-10-25'].dailyDone, 1);
});

test('only Corporate can create weekly items', async () => {
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
  for (const period of ['DAILY', 'WEEKLY']) {
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
    await load(base + 'items/route.ts', prisma).POST(request({ department, period: 'DAILY', title: 'Task' }));
    await load(base + 'items/reorder/route.ts', prisma).PUT(request({ department, period: 'DAILY', orderedIds: ['task'] }));
    assert.equal(seen.length, 6);
    assert.ok(seen.every((value) => value === department));
  }
});

test('invalid departments are rejected before database access', async () => {
  const result = await load(base + 'items/route.ts').POST(request({ department: 'OTHER', period: 'DAILY', title: 'Task' }));
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
  const result = await load(base + 'items/[itemId]/route.ts', { dailyChecklistItem: { findUnique: async () => ({ period: 'DAILY', department: 'BOARDING' }) } }).PATCH(request({ dueWeekday: 2 }), { params: Promise.resolve({ itemId: 'task' }) });
  assert.equal(result.status, 400);
});

const access = require('../src/lib/checklist-access.ts');
const groomingIds = ['cmobz2cwb0007k0041qnobqcz', 'cmoc04aqt000njr04ehczgndc', 'cmtxaffs40001l2042xiq3yrs'];

test('Stacey can configure Grooming while other departments remain forbidden', async () => {
  const user = { id: groomingIds[0], company: 'GROOMING', role: 'EMPLOYEE' };
  assert.equal(access.canEditChecklists(user), true);
  assert.deepEqual([...access.checklistDepartments(user)], ['GROOMING']);
  const prisma = { dailyChecklistItem: {
    aggregate: async () => ({ _max: { order: 0 } }),
    create: async ({ data }) => data,
    findUnique: async () => ({ department: 'GROOMING', period: 'DAILY' }),
    update: async () => ({ title: 'Updated' }),
    delete: async () => ({}),
  }, dailyChecklistCompletion: { count: async () => 0 }, $transaction: async () => [] };
  assert.equal((await load(base + 'items/route.ts', prisma, false, user).POST(request({ department: 'GROOMING', period: 'DAILY', title: 'New' }))).status, 201);
  assert.equal((await load(base + 'items/reorder/route.ts', prisma, false, user).PUT(request({ department: 'GROOMING', period: 'DAILY', orderedIds: [] }))).status, 200);
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await load(base + 'items/[itemId]/route.ts', prisma, false, user)[method](request({ title: 'Updated' }), { params: Promise.resolve({ itemId: 'task' }) })).status, 200);
  }
  for (const department of ['BOARDING', 'FRONT_DESK', 'MANAGEMENT']) {
    assert.equal((await load(base + 'items/route.ts', prisma, false, user).POST(request({ department, period: 'DAILY', title: 'No' }))).status, 403);
    assert.equal((await load(base + 'items/reorder/route.ts', prisma, false, user).PUT(request({ department, period: 'DAILY', orderedIds: [] }))).status, 403);
    const blocked = { ...prisma, dailyChecklistItem: { ...prisma.dailyChecklistItem, findUnique: async () => ({ department, period: 'DAILY' }) } };
    for (const method of ['PATCH', 'DELETE']) {
      assert.equal((await load(base + 'items/[itemId]/route.ts', blocked, false, user)[method](request({ title: 'No' }), { params: Promise.resolve({ itemId: 'task' }) })).status, 403);
    }
  }
});
test('Corporate can view and edit every checklist regardless of role', () => {
  for (const role of ['EMPLOYEE', 'MANAGER', 'SUPER_ADMIN']) {
    const user = { id: 'corporate', company: 'CORPORATE', role };
    assert.deepEqual([...access.checklistDepartments(user)], ['BOARDING', 'GROOMING', 'FRONT_DESK', 'MANAGEMENT']);
    assert.equal(access.canEditChecklists(user), true);
  }
});
test('other named Grooming staff get Grooming only and no configuration permissions even with manager role', async () => {
  for (const id of groomingIds.slice(1)) {
    for (const company of ['RESORT', 'GROOMING']) {
      const user = { id, company, role: 'MANAGER' };
      assert.deepEqual([...access.checklistDepartments(user)], ['GROOMING']);
      assert.equal(access.canEditChecklists(user), false);
      for (const department of ['BOARDING', 'FRONT_DESK', 'MANAGEMENT']) {
        const route = load(base + 'route.ts', {}, true, user);
        const result = await route.GET({ nextUrl: new URL(`https://example.com?date=2026-10-28&department=${department}`) });
        assert.equal(result.status, 403);
        const summary = await load(base + 'summary/route.ts', {}, true, user).GET({ nextUrl: new URL(`https://example.com?start=2026-10-25&end=2026-10-31&department=${department}`) });
        assert.equal(summary.status, 403);
      }
      assert.equal((await load(base + 'items/route.ts', {}, true, user).POST(request({ department: 'GROOMING', period: 'DAILY', title: 'No' }))).status, 403);
      assert.equal((await load(base + 'items/reorder/route.ts', {}, true, user).PUT(request({ department: 'GROOMING', period: 'DAILY', orderedIds: [] }))).status, 403);
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
      dailyChecklistItem: { findUnique: async () => ({ department, period: 'DAILY' }) },
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
  const result = await route.POST(request({ department: 'FRONT_DESK', period: 'DAILY', title: 'Corporate task' }));
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

test('daily tasks can be created and old AM/PM creation is rejected', async () => {
  for (const department of ['BOARDING', 'GROOMING', 'FRONT_DESK']) {
    const route = load(base + 'items/route.ts', { dailyChecklistItem: {
      aggregate: async () => ({ _max: { order: 6 } }), create: async ({ data }) => data,
    } });
    const result = await route.POST(request({ department, period: 'DAILY', title: 'Daily task' }));
    assert.equal(result.status, 201);
    assert.equal(result.body.period, 'DAILY');
    assert.equal(result.body.order, 7);
    for (const period of ['AM', 'PM']) {
      assert.equal((await route.POST(request({ department, period, title: 'Old period' }))).status, 400);
    }
  }
});

test('Derek has all four lists and Kim has three, with no editing for either', () => {
  const derek = { id: 'cmoc059wd000rjr04x03j7h19', company: 'RESORT', role: 'MANAGER' };
  const kim = { id: 'cmoc0283w000jjr04200pulk3', company: 'RESORT', role: 'MANAGER' };
  assert.deepEqual([...access.checklistDepartments(derek)], ['BOARDING', 'GROOMING', 'FRONT_DESK', 'MANAGEMENT']);
  assert.deepEqual([...access.checklistDepartments(kim)], ['BOARDING', 'FRONT_DESK', 'MANAGEMENT']);
  assert.equal(access.canEditChecklists(derek), false);
  assert.equal(access.canEditChecklists(kim), false);
});
test('shared front desk email and role get Front Desk only without editing', () => {
  for (const user of [
    { id: 'shared', email: 'planetpoochpetservices@gmail.com', company: 'RESORT', role: 'EMPLOYEE' },
    { id: 'frontdesk', company: 'RESORT', role: 'FRONT_DESK' },
  ]) {
    assert.deepEqual([...access.checklistDepartments(user)], ['FRONT_DESK']);
    assert.equal(access.canEditChecklists(user), false);
    assert.equal(access.canAccessChecklist(user, 'MANAGEMENT'), false);
  }
});
test('Management supports Daily and Weekly items for Corporate', async () => {
  for (const period of ['DAILY', 'WEEKLY']) {
    const result = await load(base + 'items/route.ts', { dailyChecklistItem: {
      aggregate: async () => ({ _max: { order: null } }), create: async ({ data }) => data,
    } }, true, { company: 'CORPORATE' }).POST(request({ department: 'MANAGEMENT', period, title: 'Management task' }));
    assert.equal(result.status, 201);
    assert.equal(result.body.department, 'MANAGEMENT');
    assert.equal(result.body.period, period);
  }
  assert.equal(access.canAccessChecklist({ id: 'other', company: 'RESORT', role: 'MANAGER' }, 'MANAGEMENT'), false);
});

test('only Corporate can change list configuration, including non-Corporate Super Admins', async () => {
  for (const role of ['MANAGER', 'SUPER_ADMIN', 'EMPLOYEE']) {
    for (const id of ['cmoc059wd000rjr04x03j7h19', 'cmoc0283w000jjr04200pulk3', 'other']) {
      const user = { id, company: 'RESORT', role };
      assert.equal(access.canEditChecklists(user), false);
      assert.equal((await load(base + 'items/route.ts', {}, true, user).POST(request({ department: 'GROOMING', period: 'DAILY', title: 'No' }))).status, 403);
      assert.equal((await load(base + 'items/reorder/route.ts', {}, true, user).PUT(request({ department: 'BOARDING', period: 'DAILY', orderedIds: [] }))).status, 403);
      for (const method of ['PATCH', 'DELETE']) {
        assert.equal((await load(base + 'items/[itemId]/route.ts', {}, true, user)[method](request({ title: 'No', dueWeekday: 2 }), { params: Promise.resolve({ itemId: 'task' }) })).status, 403);
      }
    }
  }
});
test('Derek can complete Grooming tasks without list editing access', async () => {
  const user = { id: 'cmoc059wd000rjr04x03j7h19', company: 'RESORT', role: 'MANAGER' };
  const route = load(base + 'completions/route.ts', {
    dailyChecklistItem: { findUnique: async () => ({ department: 'GROOMING', period: 'DAILY' }) },
    dailyChecklistCompletion: { upsert: async () => ({ completedAt: new Date(), completedById: user.id }) },
  }, true, user);
  assert.equal((await route.POST(request({ itemId: 'task', date: '2026-10-28', completed: true }))).status, 200);
});

test('AM and PM sign-offs are independent and only their respective signer can uncheck', async () => {
  const saved = new Map();
  const prisma = {
    dailyChecklistItem: { findUnique: async () => ({ period: 'DAILY', department: 'BOARDING', dualCheck: true }) },
    dailyChecklistCompletion: {
      upsert: async ({ create }) => { if (!saved.has(create.slot)) saved.set(create.slot, { ...create, completedAt: new Date() }); return saved.get(create.slot); },
      deleteMany: async ({ where }) => { if (saved.get(where.slot)?.completedById !== where.completedById) return { count: 0 }; saved.delete(where.slot); return { count: 1 }; },
      findUnique: async ({ where }) => saved.get(where.itemId_date_slot.slot) ?? null,
    },
  };
  const submit = (id, slot, completed) => load(base + 'completions/route.ts', prisma, false, { id, company: 'RESORT' }).POST(request({ itemId: 'dual', date: '2026-10-28', slot, completed }));
  assert.equal((await submit('am-staff', 'AM', true)).status, 200);
  assert.equal(saved.has('PM'), false);
  assert.equal((await submit('pm-staff', 'PM', true)).status, 200);
  assert.equal(saved.size, 2);
  assert.equal((await submit('pm-staff', 'AM', false)).status, 403);
  assert.equal((await submit('am-staff', 'AM', false)).status, 200);
  assert.equal(saved.has('PM'), true);
  assert.equal((await submit('am-staff', 'SINGLE', true)).status, 400);
});
test('ordinary tasks reject AM/PM slots and weekly tasks reject dual-check configuration', async () => {
  const prisma = { dailyChecklistItem: { findUnique: async () => ({ period: 'WEEKLY', department: 'BOARDING', dualCheck: false }) } };
  assert.equal((await load(base + 'completions/route.ts', prisma).POST(request({ itemId: 'weekly', date: '2026-10-28', slot: 'AM', completed: true }))).status, 400);
  assert.equal((await load(base + 'items/[itemId]/route.ts', prisma).PATCH(request({ dualCheck: true }), { params: Promise.resolve({ itemId: 'weekly' }) })).status, 400);
});
test('daily progress counts both required checks and excludes legacy single sign-offs for dual tasks', async () => {
  const route = load(base + 'summary/route.ts', {
    dailyChecklistItem: { groupBy: async () => [{ period: 'DAILY', dualCheck: true, _count: { _all: 1 } }] },
    dailyChecklistCompletion: { findMany: async () => ['SINGLE', 'AM', 'PM'].map((slot) => ({ slot, item: { period: 'DAILY', dualCheck: true }, date: new Date('2026-10-28') })) },
  });
  const result = await route.GET({ nextUrl: new URL('https://example.com?start=2026-10-25&end=2026-10-31') });
  assert.equal(result.body.dailyTotal, 2);
  assert.equal(result.body.days['2026-10-28'].dailyDone, 2);
});
