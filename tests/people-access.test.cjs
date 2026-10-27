require('tsx/cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const { canManageEmployeeLifecycle, employeeCompanyFilter } = require('../src/lib/people-access.ts');

test('only Corporate managers and admins can add or remove employees', () => {
  for (const company of ['CORPORATE', 'RESORT', 'GROOMING', null]) {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'MARKETING']) {
      assert.equal(canManageEmployeeLifecycle({ company, role }), company === 'CORPORATE' && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role));
      if (company) assert.deepEqual(employeeCompanyFilter(role, company), company === 'CORPORATE' ? {} : { company });
    }
  }
  assert.equal(canManageEmployeeLifecycle(undefined), false);
  assert.throws(() => employeeCompanyFilter('SUPER_ADMIN', null));
});

test('direct lifecycle API calls reject every business role before touching employee data', async () => {
  let user;
  const originalLoad = Module._load;
  Module._load = function (id, ...args) {
    if (id === '@/lib/auth-helpers') return {
      getSession: async () => user ? { user } : null,
      hasEmployeeManagementAccess: () => true,
      isSuperAdmin: () => true,
      isManagerOrAbove: () => true,
    };
    if (id === '@/lib/prisma') return { prisma: new Proxy({}, { get() { throw new Error('Must not touch employee data'); } }) };
    if (id === '@/lib/drive' || id === '@/lib/module-visibility') return {};
    return originalLoad.call(this, id, ...args);
  };
  try {
    const handlers = [
      require('../src/app/api/employees/route.ts').POST,
      require('../src/app/api/employees/[employeeId]/route.ts').DELETE,
      require('../src/app/api/employees/[employeeId]/end-employment/route.ts').POST,
      require('../src/app/api/employees/[employeeId]/reactivate/route.ts').POST,
    ];
    for (const company of ['RESORT', 'GROOMING']) {
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']) {
        user = { id: 'actor', company, role };
        for (const handler of handlers) {
          const response = await handler(new Request('http://localhost/api/employees', { method: 'POST' }), { params: Promise.resolve({ employeeId: 'target' }) });
          assert.equal(response.status, 403);
        }
      }
    }
    user = undefined;
    for (const handler of handlers) assert.equal((await handler(undefined, { params: Promise.resolve({ employeeId: "target" }) })).status, 403);
  } finally {
    Module._load = originalLoad;
  }
});
