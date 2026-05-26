import type { KpiSegment } from "@prisma/client";

export type KpiFormat = "number" | "currency" | "percent";
export type KpiSection = "ACTUALS" | "FORECAST";

export interface KpiMetricDef {
  key: string;
  label: string;
  section: KpiSection;
  format: KpiFormat;
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
      { key: "routes_planned", label: "Routes planned", section: "FORECAST", format: "number" },
      { key: "dogs_scheduled", label: "Dogs scheduled", section: "FORECAST", format: "number" },
      { key: "clients_scheduled", label: "Clients scheduled", section: "FORECAST", format: "number" },
      { key: "new_clients_scheduled", label: "New clients scheduled", section: "FORECAST", format: "number" },
      { key: "total_expected_revenue", label: "Total expected revenue (net of fees & taxes)", section: "FORECAST", format: "currency" },
    ],
  },
  { key: "BOARDING", label: "Boarding", metrics: [] },
  { key: "TRAINING", label: "Training", metrics: [] },
  { key: "DAYCARE", label: "Daycare", metrics: [] },
  { key: "IN_HOUSE_GROOMING", label: "In-House Grooming", metrics: [] },
];

export const DEFAULT_SEGMENT: KpiSegment = "MOBILE_GROOMING";

export function getSegmentDef(key: string | undefined | null): KpiSegmentDef {
  return KPI_SEGMENTS.find((s) => s.key === key) ?? KPI_SEGMENTS[0];
}

export function isValidSegment(key: string): key is KpiSegment {
  return KPI_SEGMENTS.some((s) => s.key === key);
}

// True when metricKey is part of the given segment's definition — guards the
// API against orphan rows.
export function isValidMetricKey(segment: KpiSegment, metricKey: string): boolean {
  return getSegmentDef(segment).metrics.some((m) => m.key === metricKey);
}
