import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionProvider } from "next-auth/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { Sidebar } from "../src/components/layout/Sidebar";
import { BusinessProvider } from "../src/components/business/BusinessProvider";
import { BUSINESSES } from "../src/lib/business";
import { proxy } from "../src/proxy";

Object.assign(globalThis, { React });

test("Corporate has one People link while Resort retains its business People link", () => {
  for (const company of ["CORPORATE", "RESORT"] as const) {
    const session: Session = { expires: "2099-01-01", user: { id: "cmoc059wd000rjr04x03j7h19", role: "MANAGER", company, name: "Test", jobTitle: null, mustChangePassword: false } };
    const html = renderToStaticMarkup(
      <SessionProvider session={session}><PathnameContext.Provider value="/admin/people">
        <BusinessProvider business={BUSINESSES[0]}><Sidebar /></BusinessProvider>
      </PathnameContext.Provider></SessionProvider>,
    );
    assert.equal(html.includes('href="/admin/people"'), company === "CORPORATE");
    assert.equal(html.includes('href="/admin/employees?company=RESORT"'), company === "RESORT");
    assert.ok(!html.includes('href="/admin/employees?company=GROOMING"'));
    if (company === "CORPORATE") assert.match(html, /<a(?=[^>]*href="\/admin\/people")(?=[^>]*aria-current="page")[^>]*>/);
  }
});

test("legacy Corporate links preserve employee IDs and filters; business users cannot enter Corporate People", async () => {
  const priorSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "people-navigation-test";
  try {
    for (const company of ["CORPORATE", "RESORT"] as const) {
      const token = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { id: "test", role: "MANAGER", company } });
      const headers = { cookie: `next-auth.session-token=${token}` };
      const response = await proxy(new NextRequest(company === "CORPORATE"
        ? "http://localhost/admin/employees/employee-id?status=terminated&company=RESORT"
        : "http://localhost/admin/people/employee-id", { headers }));
      assert.equal(response.headers.get("location"), company === "CORPORATE"
        ? "http://localhost/admin/people/employee-id?status=terminated"
        : "http://localhost/admin/employees");
    }
  } finally { process.env.NEXTAUTH_SECRET = priorSecret; }
});
