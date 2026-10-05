import { prisma } from "@/lib/prisma";
import { getActiveBusiness } from "@/lib/business-server";
import { BUSINESSES } from "@/lib/business";
import { resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";
import { reportPeriod } from "@/lib/knowledge-report-period";
import type { KnowledgeSource } from "@/lib/knowledge";

export function isFormSubmissionCountQuestion(question: string): boolean {
  return /\b(?:how many|count|number of|total)\b/i.test(question)
    && !/\b(?:google|meta|facebook|instagram)\b/i.test(question)
    && !/\b(?:boarding|day[ -]?care|training|grooming)\b/i.test(question.replace(/\bmobile[ -]?grooming\b/gi, ""))
    && /\b(?:lead[\s-]*forms?|(?:new[\s-]*(?:client[\s-]*)?|website[\s-]*|client[\s-]*)?form[\s-]*submissions?|(?:new[\s-]*|website[\s-]*)forms?)\b/i.test(question)
    && reportPeriod(question) !== null;
}

export async function findFormSubmissionReport(question: string): Promise<KnowledgeSource[]> {
  if (/\b(?:boarding|day[ -]?care|training|grooming)\b/i.test(
    question.replace(/\bmobile[ -]?grooming\b/gi, ""))) return [];
  const period = reportPeriod(question);
  const active = await getActiveBusiness();
  const explicit = /\bmobile[ -]?grooming\b/i.test(question) ? BUSINESSES[1]
    : /\bpet[ -]?resort\b/i.test(question) ? BUSINESSES[0] : null;
  const combined = /\b(?:both businesses|all businesses|combined|company[ -]?wide)\b/i.test(question);
  const businesses = combined ? [...BUSINESSES] : [explicit ?? active];
  const label = combined ? "Pet Resort and Mobile Grooming" : businesses[0].label;
  const range = resolveSubmissionDateRange(period?.start, period?.end);
  const count = await prisma.websiteFormSubmission.count({
    where: { company: combined ? { in: businesses.map((business) => business.company) } : businesses[0].company,
      receivedAt: { gte: range.startAt, lt: range.endBefore } },
  });
  const url = `/marketing/website-attribution/new-form-submissions?submissionStart=${range.start}&submissionEnd=${range.end}`;
  const answer = `${count} new form submission${count === 1 ? "" : "s"} were received for ${label} from ${range.start} through ${range.end} (Eastern, inclusive). This counts saved website form submissions across all statuses. The report page displays one selected business at a time. [1]`;
  return [{
    id: `record:report:form-submissions:${businesses.map((business) => business.company).join("+")}:${range.start}:${range.end}`,
    title: `New form submissions: ${label}, ${range.start} to ${range.end}`,
    kind: "record", url, excerpt: answer, answer,
    updatedAt: new Date().toISOString(), dateKind: "entry",
  }];
}
