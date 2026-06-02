import type { KpiSegment } from "@prisma/client";

export type KpiFormat = "number" | "currency" | "percent";
export type KpiSection = "ACTUALS" | "FORECAST";

export interface KpiMetricDef {
  key: string;
  label: string;
  section: KpiSection;
  format: KpiFormat;
  // When set, this metric's target & average mirror the named metric's
  // (used for FORECAST rows that share the Actuals goal). Mirrored metrics
  // are read-only for target/average and resolve from their source.
  mirrorsKey?: string;
}

export interface KpiSegmentDef {
  key: KpiSegment;
  label: string;
  metrics: KpiMetricDef[];
}

// Section labels shown above each table on the page.
export const SECTION_LABELS: Record<KpiSection, string> = {
  ACTUALS: "Last Week — Actuals",
  FORECAST: "Next Week — Forecast",
};

// Tab order follows array order. Segments with no metrics render an empty
// state until their KPI list is supplied.
export const KPI_SEGMENTS: KpiSegmentDef[] = [
  {
    key: "MOBILE_GROOMING",
    label: "Mobile Grooming",
    metrics: [
      { key: "routes_completed", label: "Routes completed", section: "ACTUALS", format: "number" },
      { key: "dogs_serviced", label: "Dogs serviced", section: "ACTUALS", format: "number" },
      { key: "clients_serviced", label: "Clients serviced", section: "ACTUALS", format: "number" },
      { key: "new_clients_serviced", label: "New clients serviced", section: "ACTUALS", format: "number" },
      { key: "avg_rebook_rate", label: "Average rebook rate", section: "ACTUALS", format: "percent" },
      { key: "total_revenue", label: "Total revenue (net of fees & taxes)", section: "ACTUALS", format: "currency" },
      { key: "routes_planned", label: "Routes planned", section: "FORECAST", format: "number", mirrorsKey: "routes_completed" },
      { key: "dogs_scheduled", label: "Dogs scheduled", section: "FORECAST", format: "number", mirrorsKey: "dogs_serviced" },
      { key: "clients_scheduled", label: "Clients scheduled", section: "FORECAST", format: "number", mirrorsKey: "clients_serviced" },
      { key: "new_clients_scheduled", label: "New clients scheduled", section: "FORECAST", format: "number", mirrorsKey: "new_clients_serviced" },
      { key: "total_expected_revenue", label: "Total expected revenue (net of fees & taxes)", section: "FORECAST", format: "currency", mirrorsKey: "total_revenue" },
    ],
  },
  {
    key: "BOARDING",
    label: "Boarding",
    metrics: [
      { key: "revenue", label: "Revenue", section: "ACTUALS", format: "currency" },
      { key: "nights", label: "Nights", section: "ACTUALS", format: "number" },
      { key: "upsells", label: "Upsells", section: "ACTUALS", format: "currency" },
    ],
  },
  {
    key: "TRAINING",
    label: "Training",
    metrics: [
      { key: "product_sales", label: "Product sales", section: "ACTUALS", format: "currency" },
      { key: "group_revenue", label: "Group revenue", section: "ACTUALS", format: "currency" },
      { key: "one_on_one_revenue", label: "1:1 revenue", section: "ACTUALS", format: "currency" },
    ],
  },
  {
    key: "DAYCARE",
    label: "Daycare",
    metrics: [
      { key: "total_appointments", label: "Total non-training appointments", section: "ACTUALS", format: "number" },
      { key: "avg_daily_occupancy", label: "Average daily occupancy", section: "ACTUALS", format: "number" },
      { key: "package_sales", label: "Package sales", section: "ACTUALS", format: "currency" },
      { key: "addon_sales", label: "Addon sales", section: "ACTUALS", format: "currency" },
      { key: "payroll_hours", label: "Payroll hours", section: "ACTUALS", format: "number" },
      { key: "unique_clients", label: "Unique clients", section: "ACTUALS", format: "number" },
      { key: "avg_visits", label: "Average number of visits", section: "ACTUALS", format: "number" },
      { key: "total_net_sales", label: "Total net sales", section: "ACTUALS", format: "currency" },
    ],
  },
  {
    key: "IN_HOUSE_GROOMING",
    label: "In-House Grooming",
    metrics: [
      { key: "revenue", label: "Revenue", section: "ACTUALS", format: "currency" },
      { key: "upsells", label: "Upsells", section: "ACTUALS", format: "currency" },
      { key: "total_pets_serviced", label: "Total Pets Serviced", section: "ACTUALS", format: "number" },
    ],
  },
];

export const DEFAULT_SEGMENT: KpiSegment = "MOBILE_GROOMING";

export function getSegmentDef(key: string | undefined | null): KpiSegmentDef {
  return KPI_SEGMENTS.find((s) => s.key === key) ?? KPI_SEGMENTS[0];
}

export function isValidSegment(key: string): key is KpiSegment {
  return KPI_SEGMENTS.some((s) => s.key === key);
}

export function getMetricDef(
  segment: KpiSegment,
  metricKey: string,
): KpiMetricDef | undefined {
  return getSegmentDef(segment).metrics.find((m) => m.key === metricKey);
}

// True when metricKey is part of the given segment's definition — guards the
// API against orphan rows.
export function isValidMetricKey(segment: KpiSegment, metricKey: string): boolean {
  return getSegmentDef(segment).metrics.some((m) => m.key === metricKey);
}
