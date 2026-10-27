import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionProvider } from "next-auth/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import type { Company, Role } from "@prisma/client";
import type { Session } from "next-auth";
import { Sidebar } from "../src/components/layout/Sidebar";
import { BusinessSelector } from "../src/components/business/BusinessSelector";
import { BusinessProvider } from "../src/components/business/BusinessProvider";
import { BUSINESSES, businessCookieName } from "../src/lib/business";
import { proxy } from "../src/proxy";

// Components use the Next.js JSX transform in production.
Object.assign(globalThis, { React });

function renderNavigation(company: "RESORT" | "GROOMING", role: Role = "SUPER_ADMIN", assigned: Company = "CORPORATE", path = "/admin/module-progress") {
  const session: Session = { expires: "2099-01-01", user: { id: "navigation-test", name: "Test", role, company: assigned, jobTitle: null, mustChangePassword: false } };
  return renderToStaticMarkup(
    <SessionProvider session={session}>
      <PathnameContext.Provider value={path}>
        <BusinessProvider business={BUSINESSES.find((item) => item.company === company)!}>
          <Sidebar />
          <BusinessSelector options={BUSINESSES} />
        </BusinessProvider>
      </PathnameContext.Provider>
    </SessionProvider>,
  );
}

test("both company groups have their Operations and HR links, with only the current company highlighted", () => {
  for (const company of ["RESORT", "GROOMING"] as const) {
    const html = renderNavigation(company);
    for (const path of ["/maintenance", "/admin/employees", "/admin/module-progress"]) {
      for (const scope of ["RESORT", "GROOMING"]) assert.ok(html.includes(`href="${path}?company=${scope}"`));
    }
    assert.ok(html.includes('href="/maintenance/checklists?company=RESORT"'));
    assert.ok(html.includes('href="/operations/daycare?company=RESORT"'));
    assert.ok(html.includes('href="/maintenance/vans?company=GROOMING"'));
    assert.ok(!html.includes('href="/maintenance/vans?company=RESORT"'));
    assert.ok(!html.includes('href="/operations/daycare?company=GROOMING"'));
    assert.match(html, new RegExp(`href="/admin/module-progress\\?company=${company}"[^>]*aria-current="page"`));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.ok(!html.includes('id="business-selector"'));
    assert.ok(!html.includes('>Human Resources<'));
    assert.ok(!html.includes('>Operations<'));
  }
});

test("assigned managers see their own company and employees do not gain HR navigation", () => {
  for (const company of ["RESORT", "GROOMING"] as const) {
    const manager = renderNavigation(company, "MANAGER", company);
    const other = company === "RESORT" ? "GROOMING" : "RESORT";
    assert.ok(manager.includes(`href="/admin/employees?company=${company}"`));
    assert.ok(!manager.includes(`href="/admin/employees?company=${other}"`));
    const employee = renderNavigation(company, "EMPLOYEE", company, "/maintenance");
    assert.ok(!employee.includes('href="/admin/employees'));
    assert.ok(!employee.includes('href="/admin/module-progress'));
    assert.ok(employee.includes('href="/dashboard"'));
  }
});

test("all Operations and HR views hide the dropdown while Corporate finance retains it", () => {
  for (const path of ["/maintenance", "/maintenance/checklists", "/maintenance/inventory", "/maintenance/vans",
    "/operations/daycare", "/admin/employees", "/admin/scheduling", "/admin/modules", "/admin/module-progress", "/admin/audit-log"]) {
    assert.ok(!renderNavigation("RESORT", "SUPER_ADMIN", "CORPORATE", path).includes('id="business-selector"'));
  }
  assert.ok(renderNavigation("RESORT", "SUPER_ADMIN", "CORPORATE", "/finance/kpis").includes('id="business-selector"'));
});

test("company navigation overrides an existing cookie, honors permissions, and prefetch never switches company", async () => {
  const priorSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "navigation-test-secret";
  try {
    for (const role of ["SUPER_ADMIN", "MANAGER"] as const) {
      const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { id: "navigation-test", role, company: role === "MANAGER" ? "RESORT" : "CORPORATE" } });
      for (const prefetch of [false, true]) {
        const response = await proxy(new NextRequest("http://localhost/maintenance?company=GROOMING", {
          headers: {
            cookie: `next-auth.session-token=${token}; ${businessCookieName("navigation-test")}=RESORT`,
            ...(prefetch ? { "next-router-prefetch": "1" } : {}),
          },
        }));
        assert.equal(response.cookies.get(businessCookieName("navigation-test"))?.value,
          prefetch ? undefined : role === "MANAGER" ? "RESORT" : "GROOMING");
        assert.equal(response.headers.get("x-middleware-request-x-portal-url"), "http://localhost/maintenance?company=GROOMING");
      }
    }
  } finally {
    if (priorSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = priorSecret;
  }
});
