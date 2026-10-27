const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
require('tsx/cjs');

function load(file, prisma = {}, manager = true) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/prisma': { prisma },
    '@/lib/auth-helpers': { getSession: async () => ({ user: { id: 'staff', company: 'RESORT', role: manager ? 'MANAGER' : 'EMPLOYEE' } }), isManagerOrAbove: () => manager },
    '@/lib/maintenance-access': require('../src/lib/maintenance-access.ts'),
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
        dailyChecklistItem: { findUnique: async () => ({ period }) },
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
        dailyChecklistItem: { findUnique: async () => ({ period }) },
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
