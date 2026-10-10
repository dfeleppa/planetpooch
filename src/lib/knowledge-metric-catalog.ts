/** Business meanings for report questions. The model selects these IDs; only app code executes reports. */
export const KNOWLEDGE_METRICS = [
  { id: "kpi.history", report: "kpi-history", term: "KPI history", meaning: "Dated weekly actuals and targets across service segments for growth, capacity, retention proxies and productivity. Defaults to four completed weeks, or three completed months for a previous-month comparison; reports gaps explicitly. Not actual contribution margins or daily spare capacity." },
  { id: "website.funnel", report: "funnel", term: "website funnel", meaning: "Saved website form cohort linked to subsequent appointments, with booked/completed outcomes and coverage limits. Not total-business orders, not a complete visitor-to-customer funnel." },
  { id: "website.form_submissions", report: "forms", term: "new form submissions", meaning: "Count saved new-client website forms by received date and business. 'Lead forms' without an ad platform means these submitted website forms, not anonymous visits or imported ad leads." },
  { id: "finance.net_sales", report: "profit-loss", term: "net sales", meaning: "Profit & Loss net sales, based on revenue-bearing MoeGo orders; not cash received or ad-attributed revenue." },
  { id: "finance.order_count", report: "profit-loss", term: "order count", meaning: "Number of revenue-bearing orders in the Profit & Loss report." },
  { id: "finance.estimated_expenses", report: "profit-loss", term: "estimated expenses", meaning: "Profit & Loss planning expense estimate, not actual accounting expenses or current payroll." },
  { id: "finance.estimated_profit", report: "profit-loss", term: "net profit", meaning: "Estimated Profit & Loss net profit and margin; label estimates and do not claim actual accounting profit." },
  { id: "kpi.boarding_occupancy", report: "kpis", term: "boarding occupancy", meaning: "Boarding occupied nights divided by available nights in the saved KPI report." },
  { id: "kpi.daycare_visits", report: "kpis", term: "daycare visits", meaning: "Daycare visit count or visits per staff hour from saved KPI actuals." },
  { id: "kpi.service_revenue", report: "kpis", term: "service revenue", meaning: "Saved weekly revenue KPI for a named service segment such as boarding, daycare, training, or grooming." },
  { id: "kpi.staff_hours", report: "kpis", term: "staff hours", meaning: "Staff-hour KPI actuals and productivity, when the question asks about KPI staff hours." },
  { id: "kpi.targets", report: "kpis", term: "revenue target", meaning: "Saved service revenue KPI targets and whether an actual missed its target." },
  { id: "payroll.runs", report: "payroll", term: "payroll", meaning: "Saved payroll run amounts and pay periods, distinct from service prices." },
  { id: "payroll.hours", report: "payroll", term: "payroll hours", meaning: "Saved staff timecard hours and shifts for a pay period." },
  { id: "payroll.sales_ratio", report: "payroll", term: "payroll as a percentage of net sales", meaning: "Payroll-to-sales ratio using matched saved payroll and net sales periods." },
  { id: "ads.spend", report: "ads", term: "ad spend", meaning: "Imported Meta or Google campaign spend, by saved report period and business." },
  { id: "ads.leads", report: "ads", term: "advertising leads", meaning: "Leads in imported ad campaign reports; not new-client website form submissions." },
  { id: "ads.cost_per_lead", report: "ads", term: "cost per lead", meaning: "Imported campaign spend divided by saved leads; not return on investment." },
  { id: "daycare.expired_packages", report: "daycare", term: "expired daycare packages", meaning: "Saved expired daycare package snapshot." },
  { id: "daycare.expiring_packages", report: "daycare", term: "expiring daycare packages", meaning: "Saved packages approaching expiration and remaining credit snapshot." },
  { id: "daycare.inactive_customers", report: "daycare", term: "not active daycare customers", meaning: "Saved Not Active daycare customer snapshot; a potential outreach pool, not predicted returns." },
] as const;

export type KnowledgeMetric = (typeof KNOWLEDGE_METRICS)[number];
export type KnowledgeMetricId = KnowledgeMetric["id"];
export type KnowledgeReportId = KnowledgeMetric["report"];

const metricMap = new Map<string, KnowledgeMetric>(KNOWLEDGE_METRICS.map((metric) => [metric.id, metric]));

export function knowledgeMetric(id: string): KnowledgeMetric | null {
  return metricMap.get(id) ?? null;
}
