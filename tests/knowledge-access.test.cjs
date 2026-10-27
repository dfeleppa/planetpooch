const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: (name) => dependencies[name] ?? require(name), console };
  vm.runInNewContext(js, context);
  return context.exports;
}

const access = load("src/lib/knowledge-access.ts");

function chatRoute(session, viewer) {
  return load("src/app/api/knowledge/chat/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/auth-helpers": { getSession: async () => session },
    "@/lib/business": { isBusinessSwitchOriginAllowed: () => true },
    "@/lib/knowledge": {
      getKnowledgeViewer: async () => viewer,
      findKnowledgeSources: () => { throw new Error("Unauthorized retrieval"); },
    },
    "@/lib/knowledge-access": access,
    "@/lib/knowledge-owner": {},
    "@/lib/knowledge-app-data": {},
    "@/lib/knowledge-chat-models": { KNOWLEDGE_CHAT_MODEL_IDS: ["test-model"], DEFAULT_KNOWLEDGE_CHAT_MODEL: "test-model" },
    "@/lib/knowledge-answer-request": {},
  });
}

const request = () => new Request("https://app.planet-pooch.com/api/knowledge/chat", {
  method: "POST", body: "{}", headers: { "Content-Type": "application/json" },
});

test("Corporate assignment grants access independently of role; other companies and missing assignments do not", () => {
  for (const role of ["EMPLOYEE", "MANAGER", "SUPER_ADMIN"]) {
    assert.equal(access.hasAskPoochAccess({ company: "CORPORATE", role }), true);
    for (const company of ["RESORT", "GROOMING", null, undefined]) {
      assert.equal(access.hasAskPoochAccess({ company, role }), false);
    }
  }
  assert.equal(access.hasAskPoochAccess(null), false);
  assert.equal(access.hasAskPoochAccess(undefined), false);
});

test("chat rejects unauthenticated and inactive users", async () => {
  for (const [session, viewer] of [[null, null], [{ user: { id: "inactive" } }, null]]) {
    assert.equal((await chatRoute(session, viewer).POST(request())).status, 401);
  }
});

test("chat uses the current database company and rejects even owners outside Corporate before retrieval", async () => {
  const session = { user: { id: "owner", company: "CORPORATE", role: "SUPER_ADMIN", email: "dfeleppa@gmail.com" } };
  for (const company of ["RESORT", "GROOMING", null]) {
    const response = await chatRoute(session, { ...session.user, company }).POST(request());
    assert.equal(response.status, 403);
    assert.match(response.body.error, /Corporate only/);
  }
});

test("Corporate users reach request validation using their current database assignment", async () => {
  const response = await chatRoute({ user: { id: "corporate", company: "RESORT" } }, {
    id: "corporate", company: "CORPORATE", role: "EMPLOYEE",
  }).POST(request());
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Enter a question to continue.");
});
