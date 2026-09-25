import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/knowledge";
import { orderDateRange } from "@/lib/knowledge-app-data";
import { resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";

type Model = (typeof Prisma.dmmf.datamodel.models)[number];
type Field = Model["fields"][number];
type Row = Record<string, unknown>;

const BLOCKED_FIELDS: Record<string, Set<string>> = {
  User: new Set(["passwordHash"]),
  WebsiteFormSubmission: new Set(["payload", "requestMetadata"]),
  WebsiteFormSubmissionEvent: new Set(["metadata"]),
};
const BLOCKED_NAME = /(?:password|secret|api.?key|credential|accessToken|refreshToken)/i;
const MODEL_HINTS: Record<string, string> = {
  WebsiteAttributionVisit: "website visits, campaign attribution, landing pages",
  WebsiteFormSubmission: "new client forms, submitted pets and services",
  WebsiteFormSubmissionEvent: "form delivery attempts and statuses",
  User: "employees, staff, hires, terminations",
  OrgPosition: "organization chart, reporting positions",
  LessonCompletion: "employee training progress and completed lessons",
  CompletionAuditLog: "training completion history",
  EmployeeAvailability: "staff scheduling availability",
  EmployeeDocument: "employee document metadata and uploaded files",
  EsignRequest: "employee signatures and document requests",
  MoegoOrder: "synced MoeGo orders, sales, tax, tips, refunds",
  MoegoCustomer: "synced customers, clients, appointments",
  MoegoLead: "synced MoeGo leads and referrals",
  MoegoUpcomingBoardingNight: "upcoming boarding nights",
  MoegoDaycarePackageCreditRow: "expiring daycare packages and remaining credits",
  MoegoDaycareNotActiveRow: "inactive daycare customers",
  FinancePayrollEmployeeHours: "employee hours and shifts",
  FinanceMobileGroomingPayrollEntry: "mobile grooming payroll services and tips",
  FinancePetResortPayrollRun: "Pet Resort payroll amounts and pay periods",
  FinanceFacebookCampaignReportRow: "Facebook ad campaign results",
  FinanceGoogleCampaignReportRow: "Google Ads campaign results",
  FinanceGoogleLsaLeadReportRow: "Google Local Services Ads leads",
  KpiWeeklyValue: "weekly KPI metrics and values",
  KpiStandingValue: "standing KPI targets and amounts",
  MetaAdInsight: "Meta ad performance and spending",
  BrandVoiceProfile: "marketing voice, rules and positioning",
  MarketingIdea: "marketing ideas and offers",
  InventoryAdjustment: "inventory history and quantity changes",
  MaintenanceTask: "maintenance tasks and due dates",
  DailyChecklistCompletion: "daily checklist completion history",
};

function allowedField(model: Model, field: Field): boolean {
  return (field.kind === "scalar" || field.kind === "enum")
    && !BLOCKED_NAME.test(field.name)
    && !BLOCKED_FIELDS[model.name]?.has(field.name);
}

const MODELS = Prisma.dmmf.datamodel.models.map((model) => ({
  model,
  fields: model.fields.filter((field) => allowedField(model, field)),
}));
const MODEL_MAP = new Map(MODELS.map((item) => [item.model.name, item]));
const ENUM_VALUES = new Map(Prisma.dmmf.datamodel.enums.map((item) =>
  [item.name, item.values.map((value) => value.name).join("|")]));

export function broadDataCatalog(): Array<{ model: string; fields: string[] }> {
  return MODELS.map(({ model, fields }) => ({ model: model.name, fields: fields.map((field) => field.name) }));
}

const filterSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "contains", "gte", "lte"]),
  value: z.string(),
});
const querySchema = z.object({
  model: z.string(),
  kind: z.enum(["rows", "count", "sum", "average", "group_count", "group_sum"]),
  filters: z.array(filterSchema).max(5),
  field: z.string().nullable(),
  groupField: z.string().nullable(),
  selectFields: z.array(z.string()).max(20),
  sortField: z.string().nullable(),
  sortDirection: z.enum(["asc", "desc"]),
  limit: z.number().int().min(1).max(10),
});
type DataQuery = z.infer<typeof querySchema>;
const planSchema = z.object({ queries: z.array(querySchema).max(3) });

const responseFormat = {
  type: "json_schema",
  name: "app_data_queries",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["queries"],
    properties: { queries: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["model", "kind", "filters", "field", "groupField", "selectFields", "sortField", "sortDirection", "limit"],
      properties: {
        model: { type: "string" },
        kind: { type: "string", enum: ["rows", "count", "sum", "average", "group_count", "group_sum"] },
        filters: { type: "array", items: { type: "object", additionalProperties: false,
          required: ["field", "op", "value"], properties: {
            field: { type: "string" }, op: { type: "string", enum: ["eq", "contains", "gte", "lte"] },
            value: { type: "string" },
          } } },
        field: { type: ["string", "null"] }, groupField: { type: ["string", "null"] },
        selectFields: { type: "array", items: { type: "string" } },
        sortField: { type: ["string", "null"] }, sortDirection: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "integer" },
      },
    } } },
  },
} as const;

function catalogText(): string {
  return MODELS.map(({ model, fields }) =>
    `${model.name}${MODEL_HINTS[model.name] ? ` (${MODEL_HINTS[model.name]})` : ""}: `
    + fields.map((field) => `${field.name}:${field.type}${field.kind === "enum" ? `{${ENUM_VALUES.get(field.type) ?? ""}}` : ""}${field.isList ? "[]" : ""}`).join(", ")).join("\n");
}

function outputText(response: { output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }> }): string {
  return (response.output ?? []).filter((item) => item.type === "message" && item.role === "assistant")
    .flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "").join("").trim();
}

async function planDataQueries(question: string): Promise<DataQuery[]> {
  const key = process.env.openai || process.env.OPENAI_API_KEY;
  if (!key) return [];
  const period = orderDateRange(question);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-6-luna", store: false, reasoning: { effort: "none" }, max_output_tokens: 1100,
      text: { format: responseFormat },
      instructions: [
        "Choose up to three read-only queries that answer this Planet Pooch app-data question.",
        "Use only exact model and field names in the supplied catalog. Return no queries for a policy/how-to question with no app-record need.",
        "Use filters for a named person, business, status, or period; do not return arbitrary customer or employee rows.",
        "For a count use count or group_count. For totals use sum or group_sum. For recent records use rows and a date sort.",
        "Use ISO dates in date filters. For money fields ending Cents, the database stores integer cents.",
        "Do not infer a missing period's value from another period. Do not request fields absent from the catalog.",
        "Prefer specific operational tables over general finance metrics when the question names a report or workflow.",
      ].join(" "),
      input: `Question: ${question}\n${period ? `Requested Eastern period: ${period.start} to ${period.end}.\n` : ""}Available app data:\n${catalogText()}`,
    }),
    cache: "no-store", signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error(`Data planner returned ${response.status}`);
  const parsed = planSchema.safeParse(JSON.parse(outputText(await response.json())));
  if (!parsed.success) throw new Error("Data planner returned an invalid plan");
  return parsed.data.queries;
}

function fieldFor(modelName: string, name: string | null): Field | null {
  return name ? MODEL_MAP.get(modelName)?.fields.find((field) => field.name === name) ?? null : null;
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function filterValue(field: Field, op: z.infer<typeof filterSchema>["op"], value: string): unknown | null {
  if (value.length > 200 || field.isList) return null;
  if (field.type === "String") {
    if (op === "contains") return { contains: value, mode: "insensitive" };
    return op === "eq" ? value : null;
  }
  if (field.kind === "enum") return op === "eq" ? value : null;
  if (field.type === "Int" || field.type === "BigInt" || field.type === "Float" || field.type === "Decimal") {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return op === "eq" ? number : { [op]: number };
  }
  if (field.type === "Boolean") return op === "eq" && /^(true|false)$/.test(value) ? value === "true" : null;
  if (field.type === "DateTime" && validIsoDate(value)) {
    if (field.nativeType?.[0] === "Date") {
      const date = new Date(`${value}T00:00:00.000Z`);
      return op === "eq" ? date : { [op]: date };
    }
    const bounds = resolveSubmissionDateRange(value, value);
    if (!bounds) return null;
    if (op === "eq") return { gte: bounds.startAt, lt: bounds.endBefore };
    if (op === "gte") return { gte: bounds.startAt };
    if (op === "lte") return { lt: bounds.endBefore };
  }
  return null;
}

export function validateDataQuery(query: DataQuery): boolean {
  const item = MODEL_MAP.get(query.model);
  if (!item) return false;
  if (query.filters.some(({ field, op, value }) => {
    const definition = fieldFor(query.model, field);
    return !definition || filterValue(definition, op, value) === null;
  })) return false;
  if (query.selectFields.some((field) => !fieldFor(query.model, field))) return false;
  if (query.sortField) {
    const sortField = fieldFor(query.model, query.sortField);
    if (!sortField || sortField.isList || sortField.type === "Json" || sortField.type === "Bytes") return false;
  }
  if ((query.kind === "sum" || query.kind === "average" || query.kind === "group_sum")
      && !["Int", "BigInt", "Float", "Decimal"].includes(fieldFor(query.model, query.field)?.type ?? "")) return false;
  if (query.kind === "group_count" || query.kind === "group_sum") {
    const groupField = fieldFor(query.model, query.groupField);
    if (!groupField || groupField.isList || groupField.type === "Json" || groupField.type === "Bytes") return false;
  }
  return true;
}

function queryWhere(query: DataQuery): Row {
  return { AND: query.filters.map(({ field, op, value }) => ({
    [field]: filterValue(fieldFor(query.model, field)!, op, value),
  })) };
}

type Delegate = {
  findMany(args: Row): Promise<Row[]>;
  count(args: Row): Promise<number>;
  aggregate(args: Row): Promise<Row>;
  groupBy(args: Row): Promise<Row[]>;
};

function sourceUrl(model: string, row?: Row): string {
  if (model === "User" && row?.id) return `/admin/employees/${encodeURIComponent(String(row.id))}`;
  if (model === "MoegoCustomer" && row?.moegoId) return `/finance/moego/customers/${encodeURIComponent(String(row.moegoId))}`;
  if (model.startsWith("FinancePayroll") || model.startsWith("FinanceMobileGrooming") || model.startsWith("FinancePetResortPayroll") || model === "FinanceEmployeeCommission") return "/finance/payroll";
  if (model.startsWith("Finance") || model.startsWith("Kpi")) return "/finance";
  if (model.startsWith("MoegoDaycare")) return "/operations/daycare";
  if (model.startsWith("Moego")) return "/finance/moego";
  if (model.startsWith("Website")) return "/marketing/website-attribution";
  if (model.startsWith("Meta") || /^(Marketing|BrandVoice|AdAsset|Angle|Script|Hook)/.test(model)) return "/marketing";
  if (/^(Inventory|Maintenance|DailyChecklist)/.test(model)) return "/maintenance";
  if (/^(Module|Lesson|Completion|Onboarding|OrgPosition|Employee|Esign|Signable)/.test(model)) return "/admin";
  return "/dashboard";
}

function display(value: unknown, field?: string): string {
  if (value == null) return "not recorded";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value) || typeof value === "object") {
    if (typeof (value as { toNumber?: unknown }).toNumber === "function") return String(value);
    return JSON.stringify(value).slice(0, 350);
  }
  if (field?.endsWith("Cents") && typeof value === "number") return `${value} cents ($${(value / 100).toFixed(2)})`;
  return String(value);
}

function source(model: string, id: string, title: string, lines: string[], row?: Row): KnowledgeSource {
  const timestamp = [row?.updatedAt, row?.syncedAt, row?.createdAt, row?.generatedAt]
    .find((value): value is Date => value instanceof Date) ?? new Date();
  return {
    id: `record:catalog:${model}:${id}`, kind: "record", title,
    url: sourceUrl(model, row), excerpt: lines.join("\n").slice(0, 1500),
    updatedAt: timestamp.toISOString(), dateKind: "entry",
  };
}

function queryLabel(query: DataQuery): string {
  const filters = query.filters.map(({ field, op, value }) => `${field} ${op} ${value}`).join(", ");
  return `${query.model}${filters ? ` (${filters})` : " (all saved records)"}`;
}

async function executeDataQuery(query: DataQuery): Promise<KnowledgeSource[]> {
  if (!validateDataQuery(query)) return [];
  const delegateName = query.model[0].toLowerCase() + query.model.slice(1);
  const delegate = (prisma as unknown as Record<string, Delegate>)[delegateName];
  if (!delegate) return [];
  const where = queryWhere(query);
  const label = queryLabel(query);
  const checked = `Database checked: ${new Date().toISOString()}.`;
  if (query.kind === "count") {
    const count = await delegate.count({ where });
    return [source(query.model, `count:${label}`, `Count: ${label}`, [`Matching saved records: ${count}.`, checked])];
  }
  if (query.kind === "sum" || query.kind === "average") {
    const aggregate = await delegate.aggregate({ where, _count: { _all: true },
      [query.kind === "sum" ? "_sum" : "_avg"]: { [query.field!]: true } });
    const count = (aggregate._count as Row)?._all ?? 0;
    const value = (aggregate[query.kind === "sum" ? "_sum" : "_avg"] as Row)?.[query.field!];
    return [source(query.model, `${query.kind}:${label}`, `${query.kind}: ${query.field} in ${label}`,
      [`Matching saved records: ${display(count)}; ${query.kind} of ${query.field}: ${display(value, query.field!)}.`, checked])];
  }
  if (query.kind === "group_count" || query.kind === "group_sum") {
    const isSum = query.kind === "group_sum";
    const rows = await delegate.groupBy({ by: [query.groupField!], where, take: Math.min(query.limit, 8),
      _count: { _all: true }, ...(isSum ? { _sum: { [query.field!]: true } } : {}),
      orderBy: isSum ? { _sum: { [query.field!]: "desc" } } : { _count: { _all: "desc" } },
    });
    return [source(query.model, `${query.kind}:${label}`, `${query.kind}: ${label}`,
      [rows.length ? rows.map((row) => `${query.groupField}: ${display(row[query.groupField!])}; count: ${display((row._count as Row)?._all)}${isSum ? `; ${query.field}: ${display((row._sum as Row)?.[query.field!], query.field!)}` : ""}`).join("\n") : "No matching saved records.", checked])];
  }
  const item = MODEL_MAP.get(query.model)!;
  const defaults = ["id", "name", "title", "customerName", "employeeName", "date", "weekStart", "periodStart", "updatedAt", "syncedAt", "createdAt"];
  const selected = [...new Set([...query.selectFields, ...defaults])]
    .filter((field) => item.fields.some((candidate) => candidate.name === field)).slice(0, 18);
  if (selected.length === 0) selected.push(...item.fields.slice(0, 12).map((field) => field.name));
  const select = Object.fromEntries(selected.map((field) => [field, true]));
  const sortField = query.sortField ?? item.fields.find((field) => ["updatedAt", "syncedAt", "createdAt", "date", "weekStart"].includes(field.name))?.name;
  const rows = await delegate.findMany({ where, select, take: Math.min(query.limit, 5),
    ...(sortField ? { orderBy: { [sortField]: query.sortDirection } } : {}) });
  if (!rows.length) return [source(query.model, `empty:${label}`, `No records: ${label}`,
    ["No matching saved records were found. This is missing data, not a zero value.", checked])];
  return rows.map((row, index) => {
    const id = String(row.id ?? row.moegoId ?? row.customerId ?? row.campaignId ?? index);
    const name = row.title ?? row.name ?? row.customerName ?? row.employeeName ?? row.metricKey ?? row.date ?? id;
    return source(query.model, id, `${query.model}: ${display(name)}`,
      [`Saved ${query.model} record matching ${label}. This is one of up to ${Math.min(query.limit, 5)} returned rows, not a complete count.`,
        ...selected.map((field) => `${field}: ${display(row[field], field)}`)], row);
  });
}

export async function findBroadAppDataSources(question: string): Promise<KnowledgeSource[]> {
  try {
    const queries = await planDataQueries(question);
    const groups = await Promise.allSettled(queries.filter(validateDataQuery).map(executeDataQuery));
    for (const group of groups) {
      if (group.status === "rejected") console.error("[knowledge.data] One catalog query failed");
    }
    return groups.flatMap((group) => group.status === "fulfilled" ? group.value : []).slice(0, 5);
  } catch (error) {
    console.error("[knowledge.data] Broad lookup failed", error instanceof Error ? error.name : "unknown");
    return [];
  }
}
