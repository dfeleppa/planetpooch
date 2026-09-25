import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/knowledge";
import { chartPresetRange } from "@/lib/moego/chart-date-range";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { addCalendarDays, formatEasternDate, resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";
import { BUSINESSES } from "@/lib/business";
import { findKpiSources, isKpiQuestion } from "@/lib/knowledge-kpis";

type Area = "customers" | "employees" | "payroll" | "finance" | "forms" | "marketing" | "operations";

const intentPatterns: Record<Area, RegExp> = {
  customers: /\b(customers?|clients?|moego|appointments?|visits?|lifetime value|ltv|dogs?|pets?)\b/i,
  employees: /\b(employees?|staff|team members?|groomers?|hire|job titles?|managers?)\b/i,
  payroll: /\b(payroll|paycheck|hours|clock.in|commission|tip|wage|salary|paid)\b/i,
  finance: /\b(revenue|sales|profit|expense|finance|income|kpi|ad spend|order total)\b/i,
  forms: /\b(forms?|submissions?|leads?|referrals?|attribution|website)\b/i,
  marketing: /\b(marketing|campaigns?|advertis\w*|creatives?|ad ideas?)\b/i,
  operations: /\b(maintenance|inventory|stock|suppl\w*|checklists?|tasks?)\b/i,
};

export function appDataAreas(question: string): Area[] {
  return (Object.keys(intentPatterns) as Area[]).filter((area) =>
    intentPatterns[area].test(area === "customers" ? question.replace(/\bpet[\s-]*resort\b/gi, "resort") : question));
}

export function knowledgeRetrievalQuestion(messages: Array<{ role: "user" | "assistant"; content: string }>): string {
  const latest = messages.at(-1)?.content ?? "";
  if (!/^(?:what about|how about|and\b|for\b|same\b)/i.test(latest.trim())) return latest;
  const prior = messages.slice(0, -1).reverse().find((message) =>
    message.role === "user" && appDataAreas(message.content).length > 0);
  if (!prior) return latest;
  const areas = appDataAreas(latest);
  if (areas.length === 0) {
    const topic = prior.content
      .replace(/\b(?:last|this)\s+(?:week|month|year)\b/gi, "")
      .replace(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/g, "")
      .replace(/\s+/g, " ").trim();
    return `${latest} ${topic}`;
  }
  if (areas.includes("payroll") && !payrollBusiness(latest)) {
    const business = payrollBusiness(prior.content);
    if (business) return `${latest} ${business}`;
  }
  return latest;
}

export function personLookup(question: string): string | null {
  const email = question.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
  if (email) return email;
  const phone = question.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)?.[0];
  if (phone) return phone.replace(/\D/g, "").slice(-7);
  const names = question.match(/\b[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){1,2}\b/g) ?? [];
  return names.find((name) => !/^(Planet Pooch|Pet Resort|Mobile Grooming|Floor Lead|Front Desk|Website Form|MoeGo Customer|How Many|What Are|What [A-Z]|How [A-Z]|Can [A-Z]|Tell [A-Z])$/.test(name))
    ?.replace(/['’]s$/i, "") ?? null;
}

export function orderDateRange(question: string, now = new Date()): { start: string; end: string } | null {
  const lower = question.toLowerCase();
  const today = formatEasternDate(now);
  const explicitDates = [...question.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/g)]
    .map(([value]) => {
      const parts = value.includes("/") ? value.split("/").map(Number) : null;
      const iso = parts
        ? `${parts[2]}-${String(parts[0]).padStart(2, "0")}-${String(parts[1]).padStart(2, "0")}`
        : value;
      const parsed = new Date(`${iso}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
    }).filter((value): value is string => value !== null);
  if (explicitDates.length) return { start: explicitDates[0], end: explicitDates[1] ?? explicitDates[0] };
  if (/\blast week\b/.test(lower)) {
    const range = chartPresetRange("last-week", now);
    return { start: range.from, end: range.to };
  }
  if (/\blast month\b/.test(lower)) {
    const range = chartPresetRange("last-month", now);
    return { start: range.from, end: range.to };
  }
  if (/\blast year\b/.test(lower)) {
    const range = chartPresetRange("last-year", now);
    return { start: range.from, end: range.to };
  }
  if (/\bthis month\b/.test(lower)) return { start: `${today.slice(0, 7)}-01`, end: today };
  if (/\bthis year\b|\byear to date\b|\bytd\b/.test(lower)) return { start: `${today.slice(0, 4)}-01-01`, end: today };
  if (/\bthis week\b/.test(lower)) {
    const day = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    return { start: addCalendarDays(today, -day)!, end: today };
  }
  if (/\byesterday\b/.test(lower)) {
    const day = addCalendarDays(today, -1)!;
    return { start: day, end: day };
  }
  if (/\btoday\b/.test(lower)) return { start: today, end: today };
  return null;
}

export function payrollBusiness(question: string): "pet-resort" | "mobile-grooming" | null {
  if (/\b(?:pet[\s-]*resort|resort)\b/i.test(question)) return "pet-resort";
  if (/\bmobile[\s-]*grooming\b/i.test(question)) return "mobile-grooming";
  return null;
}

export function payrollPayPeriod(range: { start: string; end: string }): string {
  const display = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  return `${display(range.start)} to ${display(range.end)}`;
}

function money(cents: number | null | undefined): string {
  return cents == null ? "not recorded" : `$${(cents / 100).toFixed(2)}`;
}

function date(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "not recorded";
}

function recordSource(
  area: string,
  id: string,
  title: string,
  url: string,
  lines: Array<string | null | undefined>,
  updatedAt: Date,
): KnowledgeSource {
  return {
    id: `record:${area}:${id}`,
    kind: "record",
    title,
    url,
    excerpt: lines.filter(Boolean).join("\n").slice(0, 1500),
    updatedAt: updatedAt.toISOString(),
    dateKind: "entry",
  };
}

async function peopleSources(lookup: string, areas: Area[]): Promise<KnowledgeSource[]> {
  const isPhone = /^\d{7}$/.test(lookup);
  const isEmail = lookup.includes("@");
  const customerWhere = isPhone
    ? { mainPhoneNumber: { contains: lookup } }
    : isEmail
      ? { email: { contains: lookup, mode: "insensitive" as const } }
      : { name: { contains: lookup, mode: "insensitive" as const } };
  const userWhere = isPhone
    ? { phone: { contains: lookup } }
    : isEmail
      ? { email: { contains: lookup, mode: "insensitive" as const } }
      : { name: { contains: lookup, mode: "insensitive" as const } };
  const [customers, employees, leads, forms] = await Promise.all([
    prisma.moegoCustomer.findMany({ where: customerWhere, take: 3, orderBy: { syncedAt: "desc" } }),
    prisma.user.findMany({ where: userWhere, take: 3, select: {
      id: true, name: true, email: true, phone: true, role: true, company: true,
      jobTitle: true, department: true, hireDate: true, terminatedAt: true, updatedAt: true,
    } }),
    areas.includes("forms") || areas.includes("customers")
      ? prisma.moegoLead.findMany({ where: isPhone
        ? { mainPhoneNumber: { contains: lookup } }
        : { name: { contains: lookup, mode: "insensitive" } }, take: 2 })
      : Promise.resolve([]),
    prisma.websiteFormSubmission.findMany({ where: isPhone
      ? { phone: { contains: lookup } }
      : isEmail
        ? { email: { contains: lookup, mode: "insensitive" } }
        : { AND: [
          { firstName: { contains: lookup.split(" ")[0], mode: "insensitive" } },
          { lastName: { contains: lookup.split(" ").at(-1) ?? lookup, mode: "insensitive" } },
        ] }, take: 2, orderBy: { receivedAt: "desc" } }),
  ]);

  const customerIds = customers.map((customer) => customer.moegoId);
  const orderTotals = customerIds.length ? await prisma.moegoOrder.groupBy({
    by: ["customerMoegoId"],
    where: { customerMoegoId: { in: customerIds }, status: { in: [...REVENUE_ORDER_STATUSES] } },
    _sum: { paidCents: true }, _count: { _all: true }, _max: { salesDatetime: true },
  }) : [];
  const totals = new Map(orderTotals.map((row) => [row.customerMoegoId, row]));

  const sources: KnowledgeSource[] = customers.map((customer) => {
    const total = totals.get(customer.moegoId);
    return recordSource("customer", customer.moegoId, `Customer: ${customer.name ?? customer.moegoId}`,
      `/finance/moego/customers/${encodeURIComponent(customer.moegoId)}`, [
        `Synced MoeGo customer. Name: ${customer.name ?? "not recorded"}; email: ${customer.email ?? "not recorded"}; phone: ${customer.mainPhoneNumber ?? "not recorded"}.`,
        `Lead source: ${customer.leadSource ?? "not recorded"}; tags: ${customer.tags.join(", ") || "none"}; preferred business: ${customer.preferredBusinessId ?? "not recorded"}.`,
        `Last appointment: ${date(customer.lastAppointmentDate)}; next appointment: ${date(customer.nextAppointmentDate)}.`,
        `Revenue-bearing synced orders: ${total?._count._all ?? 0}; sum of paid amounts: ${money(total?._sum.paidCents)}; latest recorded sale date: ${date(total?._max.salesDatetime)}.`,
        `MoeGo sync timestamp: ${customer.syncedAt.toISOString()}.`,
      ], customer.syncedAt);
  });
  sources.push(...employees.map((employee) => recordSource("employee", employee.id,
    `Employee: ${employee.name}`, `/admin/employees/${employee.id}`, [
      `Name: ${employee.name}; email: ${employee.email}; phone: ${employee.phone ?? "not recorded"}.`,
      `Role: ${employee.role}; company: ${employee.company}; job title: ${employee.jobTitle ?? "not recorded"}; department: ${employee.department ?? "not recorded"}.`,
      `Hire date: ${date(employee.hireDate)}; terminated: ${employee.terminatedAt ? date(employee.terminatedAt) : "no"}.`,
    ], employee.updatedAt)));
  sources.push(...leads.map((lead) => recordSource("lead", lead.moegoId,
    `MoeGo lead: ${lead.name ?? lead.moegoId}`, "/finance/moego", [
      `Name: ${lead.name ?? "not recorded"}; phone: ${lead.mainPhoneNumber ?? "not recorded"}; referral source: ${lead.referralSource ?? "not recorded"}.`,
      `Created: ${date(lead.createdTime)}; synced: ${lead.syncedAt.toISOString()}.`,
    ], lead.syncedAt)));
  sources.push(...forms.map((form) => recordSource("form", form.id,
    `Website form: ${[form.firstName, form.lastName].filter(Boolean).join(" ") || form.id}`,
    "/marketing/website-attribution", [
      `Received: ${form.receivedAt.toISOString()}; status: ${form.status}; company: ${form.company}.`,
      `Name: ${[form.firstName, form.lastName].filter(Boolean).join(" ")}; email: ${form.email ?? "not recorded"}; phone: ${form.phone ?? "not recorded"}.`,
      `Services: ${form.services.join(", ") || "none"}; pets from submitted form: ${JSON.stringify(form.pets).slice(0, 500)}.`,
      `MoeGo customer ID: ${form.moegoCustomerId ?? "not recorded"}; lead ID: ${form.moegoLeadId ?? "not recorded"}.`,
    ], form.updatedAt)));
  return sources.slice(0, areas.includes("payroll") ? 3 : 5);
}

async function customerSummary(): Promise<KnowledgeSource[]> {
  const [count, sync] = await Promise.all([
    prisma.moegoCustomer.count(),
    prisma.moegoSyncState.findUnique({ where: { resource: "customer" } }),
  ]);
  return [recordSource("customer-summary", "all", "Synced MoeGo customer database",
    "/finance/moego", [
      `Stored customer records: ${count}. This is the app's synced customer projection, not a live MoeGo lookup.`,
      `Last successful customer sync watermark: ${sync?.lastSyncedAt.toISOString() ?? "not recorded"}.`,
    ], sync?.updatedAt ?? new Date())];
}

async function recentForms(): Promise<KnowledgeSource[]> {
  const forms = await prisma.websiteFormSubmission.findMany({ take: 3, orderBy: { receivedAt: "desc" },
    select: { id: true, firstName: true, lastName: true, services: true, status: true,
      company: true, receivedAt: true, updatedAt: true } });
  return forms.map((form) => recordSource("form", form.id,
    `Recent website form: ${[form.firstName, form.lastName].filter(Boolean).join(" ") || form.id}`,
    "/marketing/website-attribution", [
      `Received: ${form.receivedAt.toISOString()}; company: ${form.company}; status: ${form.status}.`,
      `Name: ${[form.firstName, form.lastName].filter(Boolean).join(" ") || "not recorded"}; services: ${form.services.join(", ") || "none"}.`,
    ], form.updatedAt));
}

async function payrollSources(lookup: string | null, question: string): Promise<KnowledgeSource[]> {
  const asksForHours = /\b(hours|shifts|clock.in)\b/i.test(question);
  const business = payrollBusiness(question);
  if (business === "pet-resort") return petResortPayrollSources(question, asksForHours);
  const [weeks, hours, mobileEntries, commissions] = await Promise.all([
    prisma.financePayrollWeek.findMany({
      where: asksForHours
        ? { ...(business ? { business } : {}), rows: { some: {} } }
        : { ...(business ? { business } : {}), OR: [{ rows: { some: {} } }, { mobileGroomingEntries: { some: {} } }] },
      take: 3, orderBy: { weekStart: "desc" },
      include: { rows: true, mobileGroomingEntries: true },
    }),
    lookup && !lookup.includes("@") && !/^\d/.test(lookup)
      ? prisma.financePayrollEmployeeHours.findMany({ where: { employeeName: { contains: lookup, mode: "insensitive" } },
        take: 3, orderBy: { createdAt: "desc" }, include: { payrollWeek: true } }) : Promise.resolve([]),
    lookup && !lookup.includes("@") && !/^\d/.test(lookup)
      ? prisma.financeMobileGroomingPayrollEntry.findMany({ where: { employeeName: { contains: lookup, mode: "insensitive" } },
        take: 3, orderBy: { serviceDate: "desc" }, include: { payrollWeek: true } }) : Promise.resolve([]),
    lookup && !lookup.includes("@") && !/^\d/.test(lookup)
      ? prisma.financeEmployeeCommission.findMany({ where: { employeeName: { contains: lookup, mode: "insensitive" } },
        take: 3, orderBy: { weekStart: "desc" } }) : Promise.resolve([]),
  ]);
  return [
    ...weeks.map((week) => recordSource("payroll-week", week.id,
      `Payroll hours: ${week.business}, week of ${date(week.weekStart)}`, "/finance/payroll", [
        `Period: ${date(week.weekStart)} to ${date(week.weekEnd)}; business: ${week.business}.`,
        week.rows.length
          ? `Saved hours rows: ${week.rows.length}; shifts: ${week.rows.reduce((sum, row) => sum + row.shifts, 0)}; hours: ${(week.rows.reduce((sum, row) => sum + row.totalSeconds, 0) / 3600).toFixed(2)}.`
          : "No hours rows are stored for this week; mobile grooming service entries do not measure hours.",
        `Mobile grooming service entries: ${week.mobileGroomingEntries.length}; dogs: ${week.mobileGroomingEntries.reduce((sum, row) => sum + row.dogs, 0)}; service prices (not wages): ${money(week.mobileGroomingEntries.reduce((sum, row) => sum + row.priceCents, 0))}.`,
        `Automation status: ${week.automationStatus}; source generated: ${date(week.sourceGeneratedAt)}.`,
      ], week.updatedAt)),
    ...hours.map((row) => recordSource("payroll-hours", row.id,
      `Payroll hours: ${row.employeeName}, ${date(row.payrollWeek.weekStart)}`, "/finance/payroll", [
        `Employee: ${row.employeeName}; category: ${row.category}; business: ${row.payrollWeek.business}.`,
        `Week: ${date(row.payrollWeek.weekStart)} to ${date(row.payrollWeek.weekEnd)}; shifts: ${row.shifts}; hours: ${(row.totalSeconds / 3600).toFixed(2)}.`,
      ], row.updatedAt)),
    ...mobileEntries.map((row) => recordSource("mobile-grooming-entry", row.id,
      `Mobile grooming payroll source: ${row.employeeName}, ${date(row.serviceDate)}`,
      "/finance/payroll/mobile-grooming", [
        `Employee: ${row.employeeName}; service date: ${date(row.serviceDate)}; pay period: ${date(row.payrollWeek.weekStart)} to ${date(row.payrollWeek.weekEnd)}.`,
        `Dogs: ${row.dogs}; service price (not wages): ${money(row.priceCents)}; credit-card tip: ${money(row.creditCardTipCents)}; upgrades: ${money(row.upgradeCents)}.`,
      ], row.updatedAt)),
    ...commissions.map((row) => recordSource("commission", row.id,
      `Commission status: ${row.employeeName}, ${date(row.weekStart)}`, "/finance/payroll/commissions", [
        `Employee: ${row.employeeName}; segment: ${row.businessSegment}; week start: ${date(row.weekStart)}; paid date: ${date(row.paidDate)}.`,
        "This record tracks payment status, not the commission amount.",
      ], row.updatedAt)),
  ];
}

async function petResortPayrollSources(question: string, asksForHours: boolean): Promise<KnowledgeSource[]> {
  const range = orderDateRange(question);
  if (asksForHours) {
    const [matchingWeek, latestWeek] = await Promise.all([
      range ? prisma.financePayrollWeek.findFirst({
        where: { business: "pet-resort", weekStart: new Date(`${range.start}T00:00:00.000Z`),
          weekEnd: new Date(`${range.end}T00:00:00.000Z`), rows: { some: {} } },
        include: { rows: true },
      }) : Promise.resolve(null),
      prisma.financePayrollWeek.findFirst({
        where: { business: "pet-resort", rows: { some: {} } },
        orderBy: { weekStart: "desc" }, include: { rows: true },
      }),
    ]);
    const week = matchingWeek ?? latestWeek;
    const sources: KnowledgeSource[] = [];
    if (range && !matchingWeek) sources.push(recordSource("payroll-availability", `pet-resort-hours:${range.start}`,
      `No saved Pet Resort hours for ${range.start} to ${range.end}`, "/finance/payroll", [
        `No Pet Resort payroll hours rows are stored for ${range.start} to ${range.end}. This is a database availability check, not a zero-hours total.`,
        week ? `Latest saved Pet Resort hours cover ${date(week.weekStart)} to ${date(week.weekEnd)}.` : "No Pet Resort hours week is stored.",
      ], new Date()));
    if (week) sources.push(recordSource("payroll-week", week.id,
      `Pet Resort payroll hours: ${date(week.weekStart)} to ${date(week.weekEnd)}`, "/finance/payroll", [
        `Period: ${date(week.weekStart)} to ${date(week.weekEnd)}; business: pet-resort.`,
        `Saved hours rows: ${week.rows.length}; shifts: ${week.rows.reduce((sum, row) => sum + row.shifts, 0)}; hours: ${(week.rows.reduce((sum, row) => sum + row.totalSeconds, 0) / 3600).toFixed(2)}.`,
        `Source generated: ${date(week.sourceGeneratedAt)}; saved entry updated: ${week.updatedAt.toISOString()}.`,
      ], week.updatedAt));
    return sources;
  }

  const [matchingRuns, latestRun] = await Promise.all([
    range ? prisma.financePetResortPayrollRun.findMany({
      where: { payPeriod: payrollPayPeriod(range) }, orderBy: { payRunAt: "desc" }, take: 10,
    }) : Promise.resolve([]),
    prisma.financePetResortPayrollRun.findFirst({ orderBy: { checkDate: "desc" } }),
  ]);
  const sources: KnowledgeSource[] = [];
  if (range) {
    const matchingTotalCents = matchingRuns.reduce((sum, run) => sum + Math.round(Number(run.amount) * 100), 0);
    sources.push(recordSource("payroll-availability", `pet-resort-runs:${range.start}`,
      `Pet Resort payroll for ${range.start} to ${range.end}`, "/finance/payroll", [
        matchingRuns.length
          ? `${matchingRuns.length} saved Pet Resort payroll run(s) have pay period ${range.start} to ${range.end}; combined amount: ${money(matchingTotalCents)}.`
          : `No saved Pet Resort payroll run has pay period ${range.start} to ${range.end}. This is missing data, not a $0 payroll total.`,
        `Database checked: ${new Date().toISOString()}.`,
      ], new Date()));
  }
  const runs = matchingRuns.length ? matchingRuns : latestRun ? [latestRun] : [];
  sources.push(...runs.map((run) => recordSource("payroll-run", run.id,
    `Pet Resort payroll run: ${run.payPeriod}`, "/finance/payroll", [
      `Business: pet-resort; payroll type: ${run.payrollType}; pay period: ${run.payPeriod}.`,
      `Amount: $${run.amount.toString()}; check date: ${date(run.checkDate)}; schedule: ${run.schedule}.`,
      `Run entered: ${run.payRunAt.toISOString()}.`,
    ], run.updatedAt)));
  return sources;
}

async function financeSources(): Promise<KnowledgeSource[]> {
  const [metrics, payrollRuns] = await Promise.all([
    prisma.financeMetric.findMany({ take: 5, orderBy: { periodEnd: "desc" } }),
    prisma.financePetResortPayrollRun.findMany({ take: 3, orderBy: { checkDate: "desc" } }),
  ]);
  return [
    ...metrics.map((row) => recordSource("finance", row.id,
      `Saved finance metrics: ${row.business}, ${date(row.periodStart)} to ${date(row.periodEnd)}`,
      "/finance/profit-loss", [
        `Business: ${row.business}; period: ${date(row.periodStart)} to ${date(row.periodEnd)}.`,
        `Revenue: ${money(row.totalRevenue)}; profit: ${money(row.totalProfit)}; non-payroll expenses: ${money(row.nonPayrollExpenses)}; payroll expenses: ${money(row.payrollExpenses)}.`,
        `YTD revenue snapshot: ${money(row.ytdRevenue)}; YTD net profit snapshot: ${money(row.ytdNetProfit)}.`,
        `Customers: ${row.totalCustomers ?? "not recorded"}; ad spend: ${money(row.totalAdSpend)}; conversions: ${row.totalConversions ?? "not recorded"}.`,
        `Saved metric last updated: ${row.updatedAt.toISOString()}.`,
      ], row.updatedAt)),
    ...payrollRuns.map((row) => recordSource("payroll-run", row.id,
      `Pet Resort payroll run: ${date(row.checkDate)}`, "/finance/payroll", [
        `Type: ${row.payrollType}; check date: ${date(row.checkDate)}; amount: $${row.amount.toString()}; pay period: ${row.payPeriod}; schedule: ${row.schedule}.`,
      ], row.updatedAt)),
  ];
}

async function orderSources(question: string): Promise<KnowledgeSource[]> {
  const range = orderDateRange(question);
  const bounds = range ? resolveSubmissionDateRange(range.start, range.end) : null;
  const [rows, sync] = await Promise.all([
    prisma.$queryRaw<Array<{ businessId: string | null; orders: number; netCents: bigint; paidCents: bigint }>>`
      SELECT "businessId", COUNT(*)::int AS orders,
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "netCents",
        COALESCE(SUM("paidCents"), 0)::bigint AS "paidCents"
      FROM "MoegoOrder"
      WHERE "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
        AND (${bounds?.startAt ?? null}::timestamptz IS NULL OR
          COALESCE("salesDatetime", "completedTime", "createdTime") >= ${bounds?.startAt ?? null}::timestamptz)
        AND (${bounds?.endBefore ?? null}::timestamptz IS NULL OR
          COALESCE("salesDatetime", "completedTime", "createdTime") < ${bounds?.endBefore ?? null}::timestamptz)
      GROUP BY "businessId"
    `,
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
  ]);
  return rows.map((row) => {
    const business = BUSINESSES.find((item) => item.moegoId === row.businessId);
    const label = business?.label ?? row.businessId ?? "Unknown business";
    const period = bounds ? `${bounds.start} to ${bounds.end} Eastern` : "all stored dates";
    return recordSource("moego-orders", `${row.businessId ?? "unknown"}:${period}`,
      `Synced MoeGo orders: ${label}, ${period}`, "/finance/moego", [
        `Business: ${label}; period: ${period}; revenue-bearing statuses: COMPLETED and PROCESSING.`,
        `Orders: ${row.orders}; net sales (subtotal less discounts, before tax/tips): ${money(Number(row.netCents))}; paid amount: ${money(Number(row.paidCents))}.`,
        `Sale date uses salesDatetime, falling back to completedTime then createdTime. Period boundaries are Eastern calendar days.`,
        `Latest order sync watermark: ${sync?.lastSyncedAt.toISOString() ?? "not recorded"}. This is stored app data, not a live MoeGo query.`,
      ], sync?.updatedAt ?? new Date());
  });
}

async function marketingSources(terms: string[]): Promise<KnowledgeSource[]> {
  const specific = terms.filter((term) => !/^(marketing|campaign|campaigns|advertising|creative|idea|ideas|latest|many)$/.test(term));
  const ideas = await prisma.marketingIdea.findMany({
    where: specific.length ? { OR: specific.slice(0, 4).flatMap((term) => [
      { title: { contains: term, mode: "insensitive" as const } },
      { insight: { contains: term, mode: "insensitive" as const } },
      { notes: { contains: term, mode: "insensitive" as const } },
    ]) } : {},
    take: 3, orderBy: { updatedAt: "desc" },
  });
  return ideas.map((idea) => recordSource("marketing", idea.id,
    `Marketing idea: ${idea.title}`, `/marketing/ideas/${idea.id}`, [
      `Company: ${idea.company}; service: ${idea.serviceLine}; status: ${idea.status}; channels: ${idea.channels.join(", ")}.`,
      `Insight: ${idea.insight}; audience: ${idea.audience}; offer: ${idea.offer}; proof: ${idea.proof}; notes: ${idea.notes}.`,
    ], idea.updatedAt));
}

async function operationsSources(terms: string[]): Promise<KnowledgeSource[]> {
  const specific = terms.filter((term) => !/^(inventory|stock|maintenance|supplies|supply|checklist|task|tasks|latest|many)$/.test(term));
  const items = await prisma.inventoryItem.findMany({
    where: specific.length ? { OR: specific.slice(0, 4).flatMap((term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
    ]) } : {}, take: 4, orderBy: { updatedAt: "desc" },
  });
  return items.map((item) => recordSource("inventory", item.id,
    `Inventory: ${item.name}`, `/maintenance/inventory/${item.id}`, [
      `Company: ${item.company}; item: ${item.name}; description: ${item.description}.`,
      `Current quantity: ${item.currentQuantity} ${item.unit}; minimum threshold: ${item.minimumThreshold} ${item.unit}.`,
    ], item.updatedAt));
}

export async function findAppDataSources(question: string, terms: string[]): Promise<KnowledgeSource[]> {
  const areas = appDataAreas(question);
  const lookup = personLookup(question);
  const queries: Array<Promise<KnowledgeSource[]>> = [];
  if (isKpiQuestion(question)) queries.push(findKpiSources(question, orderDateRange(question)));
  if (lookup) queries.push(peopleSources(lookup, areas));
  if (areas.includes("customers") && !lookup) queries.push(customerSummary());
  if (areas.includes("forms") && !lookup) queries.push(recentForms());
  if (areas.includes("payroll")) queries.push(payrollSources(lookup, question));
  if (/\b(revenue|sales|orders?|income)\b/i.test(question)) queries.push(orderSources(question));
  if (areas.includes("finance")) queries.push(financeSources());
  if (areas.includes("marketing")) queries.push(marketingSources(terms));
  if (areas.includes("operations")) queries.push(operationsSources(terms));
  return (await Promise.all(queries)).flat().slice(0, 6);
}
