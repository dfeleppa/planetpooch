import assert from "node:assert/strict";
import test from "node:test";
import { canReadKnowledgeArticle, knowledgeTerms, rankKnowledgeLessons, type KnowledgeViewer } from "../src/lib/knowledge";
import { isKnowledgeOwner } from "../src/lib/knowledge-owner";
import { appDataAreas, knowledgeRetrievalQuestion, orderDateRange, payrollBusiness, payrollPayPeriod, personLookup } from "../src/lib/knowledge-app-data";

const employee: KnowledgeViewer = {
  id: "employee-1", email: "employee@example.com", role: "EMPLOYEE", company: "RESORT", jobTitle: null,
};

test("published knowledge is limited by role and company", () => {
  const article = {
    isPublished: true,
    company: "RESORT" as const,
    allowedRoles: ["MANAGER" as const],
  };
  assert.equal(canReadKnowledgeArticle(article, employee), false);
  assert.equal(canReadKnowledgeArticle(article, { ...employee, role: "MANAGER" }), true);
  assert.equal(canReadKnowledgeArticle(article, { ...employee, role: "MANAGER", company: "GROOMING" }), false);
});

test("knowledge access belongs only to Daniel's active admin login", () => {
  assert.equal(isKnowledgeOwner({ email: "dfeleppa@gmail.com", role: "SUPER_ADMIN" }), true);
  assert.equal(isKnowledgeOwner({ email: "dfeleppa@gmail.com", role: "EMPLOYEE" }), false);
  assert.equal(isKnowledgeOwner({ email: "another@example.com", role: "SUPER_ADMIN" }), false);
});

test("drafts are hidden, including from super admins on the employee page", () => {
  const article = { isPublished: false, company: null, allowedRoles: ["SUPER_ADMIN" as const] };
  assert.equal(canReadKnowledgeArticle(article, { ...employee, role: "SUPER_ADMIN" }), false);
});

test("Daniel can read drafts and all company articles", () => {
  const article = { isPublished: false, company: "GROOMING" as const, allowedRoles: ["MARKETING" as const] };
  assert.equal(canReadKnowledgeArticle(article, { ...employee, email: "dfeleppa@gmail.com", role: "SUPER_ADMIN" }), true);
});

test("super admins can review published articles regardless of article roles", () => {
  const article = { isPublished: true, company: "GROOMING" as const, allowedRoles: ["MARKETING" as const] };
  assert.equal(canReadKnowledgeArticle(article, { ...employee, role: "SUPER_ADMIN" }), true);
});

test("search uses distinct, bounded terms", () => {
  assert.deepEqual(knowledgeTerms("How do I handle daycare daycare check-in?"), ["handle", "daycare", "check"]);
});

test("a matching lesson title outranks incidental text matches", () => {
  const lessons = [
    { title: "MoeGo", searchText: "Log in before your shift." },
    { title: "1. Clock In & Pre-Shift Setup", searchText: "When you walk in, get a walkie-talkie and check with the shift lead." },
  ];
  assert.equal(rankKnowledgeLessons(lessons, knowledgeTerms("What should I do for clock in and pre-shift setup?"))[0].title, lessons[1].title);
});

test("app questions route to relevant stored record types", () => {
  assert.deepEqual(appDataAreas("What were payroll hours and revenue last week?"), ["payroll", "finance"]);
  assert.deepEqual(appDataAreas("How many customers are in the synced database?"), ["customers"]);
  assert.equal(personLookup("What is customer Jane Smith's next appointment?"), "Jane Smith");
});

test("order periods use completed Eastern calendar weeks", () => {
  assert.deepEqual(orderDateRange("What were sales last week?", new Date("2026-09-24T16:00:00Z")),
    { start: "2026-09-13", end: "2026-09-19" });
});

test("Pet Resort payroll requests target its pay period rather than Mobile Grooming", () => {
  const question = "What was the payroll for the pet resort last week?";
  assert.deepEqual(appDataAreas(question), ["payroll"]);
  assert.equal(payrollBusiness(question), "pet-resort");
  assert.equal(payrollPayPeriod(orderDateRange(question, new Date("2026-09-24T16:00:00Z"))!),
    "09/13/2026 to 09/19/2026");
  assert.equal(payrollBusiness("How many mobile grooming payroll hours?"), "mobile-grooming");
});

test("a date-only follow-up keeps the payroll topic and selects the new period", () => {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: "What was payroll for the pet resort for last week?" },
    { role: "assistant", content: "No saved run for September 13–19." },
    { role: "user", content: "what about for 09/06/2026 to 09/12/2026" },
  ];
  const retrieval = knowledgeRetrievalQuestion(messages);
  assert.deepEqual(appDataAreas(retrieval), ["payroll"]);
  assert.equal(payrollBusiness(retrieval), "pet-resort");
  assert.deepEqual(orderDateRange(retrieval, new Date("2026-09-24T16:00:00Z")),
    { start: "2026-09-06", end: "2026-09-12" });
  assert.equal(payrollPayPeriod(orderDateRange(retrieval)!), "09/06/2026 to 09/12/2026");
});

test("date-only follow-ups can use the last substantive user question", () => {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: "What was Pet Resort payroll last week?" },
    { role: "assistant", content: "No saved run." },
    { role: "user", content: "what about for 09/06/2026 to 09/12/2026" },
    { role: "assistant", content: "A saved run exists." },
    { role: "user", content: "what about for 08/30/2026 to 09/05/2026" },
  ];
  const retrieval = knowledgeRetrievalQuestion(messages);
  assert.equal(payrollBusiness(retrieval), "pet-resort");
  assert.deepEqual(orderDateRange(retrieval), { start: "2026-08-30", end: "2026-09-05" });
});
