const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

function load(relative, dependencies, extras = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const context = { exports: {}, require: (name) => dependencies[name] || require(name),
    process: { env: { NODE_ENV: "development", NEXTAUTH_SECRET: "test-only" } },
    Response, Request, URL, Buffer, Date, console, ...extras };
  vm.runInNewContext(js, context);
  return context.exports;
}
const validators = load("src/lib/marketing/website-attribution.ts", {});
const payload = () => ({
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  visitor_id: "550e8400-e29b-41d4-a716-446655440001",
  landing_page: "https://www.planet-pooch.com/get-started/?email=private#secret",
  referrer_origin: "https://google.com/search?q=private",
  campaign: { utm_source: "google", utm_campaign: "boarding" },
  click_ids: { gclid: "test-click" },
});
function endpoint(count = 1) {
  const writes = [];
  const tx = { $queryRaw: async () => [{ count }],
    $executeRaw: async (strings, ...values) => { writes.push({ sql: strings.join("?"), values }); return 1; } };
  const route = load("src/app/api/marketing/website-attribution/capture/route.ts", {
    "@/lib/prisma": { prisma: { $transaction: async (fn) => fn(tx) } },
    "@/lib/marketing/website-attribution": validators,
  });
  return { route, writes };
}
function request(body = payload(), origin = "https://www.planet-pooch.com", contentType = "application/json") {
  return new Request("https://app.planet-pooch.com/api/marketing/website-attribution/capture", {
    method: "POST", headers: { origin, "content-type": contentType }, body: JSON.stringify(body),
  });
}

test("origin allowlist and URL sanitation", () => {
  assert.equal(validators.isAttributionOriginAllowed("https://evil.example"), false);
  assert.equal(validators.isAttributionOriginAllowed("http://localhost:3017"), false);
  assert.equal(validators.isAttributionOriginAllowed("http://localhost:3017", true), true);
  assert.equal(validators.cleanAttributionLandingPage(payload().landing_page), "https://www.planet-pooch.com/get-started/");
  assert.equal(validators.cleanAttributionReferrer(payload().referrer_origin), "https://google.com");
  assert.throws(() => validators.cleanAttributionLandingPage("https://evil.example/get-started/"));
  assert.throws(() => validators.cleanAttributionLandingPage("https://www.planet-pooch.com/book/"));
});

test("strict schema rejects extra fields, contact data, bad IDs and oversized tags", () => {
  assert.equal(validators.WebsiteAttributionSchema.safeParse(payload()).success, true);
  for (const bad of [{ ...payload(), email: "private" }, { ...payload(), event_id: "bad" },
    { ...payload(), campaign: { email: "private" } }, { ...payload(), click_ids: { phone: "private" } },
    { ...payload(), campaign: { utm_source: "x".repeat(501) } }]) {
    assert.equal(validators.WebsiteAttributionSchema.safeParse(bad).success, false);
  }
});

test("capture requires allowed origin, JSON, bounded body and matching landing origin", async () => {
  const { route, writes } = endpoint();
  assert.equal((await route.POST(request(payload(), "https://evil.example"))).status, 403);
  assert.equal((await route.POST(request(payload(), undefined, "text/plain"))).status, 415);
  assert.equal((await route.POST(request({ ...payload(), unknown: true }))).status, 400);
  assert.equal((await route.POST(request({ ...payload(), landing_page: "https://planet-pooch.com/get-started/" }))).status, 400);
  assert.equal((await route.POST(request({ ...payload(), padding: "x".repeat(9000) }))).status, 400);
  assert.equal(writes.length, 0);
});

test("valid capture uses idempotent insert, server-pinned company and clean URLs", async () => {
  const { route, writes } = endpoint();
  const response = await route.POST(request());
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://www.planet-pooch.com");
  const insert = writes.find((w) => w.sql.includes("WebsiteAttributionVisit"));
  assert.match(insert.sql, /ON CONFLICT \("id"\) DO NOTHING/);
  assert.match(insert.sql, /'RESORT'/);
  assert.match(insert.sql, /VALUES \(\?::uuid, \?::uuid/);
  assert(!JSON.stringify(insert).includes("private"));
});

test("database rate limit rejects before visit insert", async () => {
  const { route, writes } = endpoint(61);
  const response = await route.POST(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(writes.length, 0);
});

test("CORS preflight is narrow and has no read endpoint", () => {
  const { route } = endpoint();
  assert.equal(route.OPTIONS(request()).status, 204);
  assert.equal(route.OPTIONS(request(payload(), "https://evil.example")).status, 403);
  assert.equal(route.GET, undefined);
});
