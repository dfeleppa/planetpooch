import assert from "node:assert/strict";
import test from "node:test";
import { canReadKnowledgeArticle, knowledgeTerms, rankKnowledgeLessons, type KnowledgeViewer } from "../src/lib/knowledge";

const employee: KnowledgeViewer = {
  id: "employee-1", role: "EMPLOYEE", company: "RESORT", jobTitle: null,
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

test("drafts are hidden, including from super admins on the employee page", () => {
  const article = { isPublished: false, company: null, allowedRoles: ["SUPER_ADMIN" as const] };
  assert.equal(canReadKnowledgeArticle(article, { ...employee, role: "SUPER_ADMIN" }), false);
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
