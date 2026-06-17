"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { KpiSegment } from "@prisma/client";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/Table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatKpiValue } from "@/lib/utils";
import {
  BOARDING_READ_ONLY_VALUE_KEYS,
  DAYCARE_READ_ONLY_VALUE_KEYS,
  KPI_SEGMENTS,
  SECTION_LABELS,
  calculateBoardingDerivedMetricValues,
  calculateDaycareDerivedMetricValues,
  getSegmentDef,
  type KpiFormat,
  type KpiSection,
} from "@/lib/kpis";
import {
  MONTH_NAMES,
  formatWeekLabel,
  formatWeekRange,
  fromWeekParam,
  monthsForYear,
  recentWeeks,
  toWeekParam,
  weeksInMonth,
  yearsRange,
} from "@/lib/week";

export type KpiCell = {
  value: number | null;
  previousValue: number | null;
  average: number | null;
  target: number | null;
};

type MobileGroomingImportReport = {
  finishedAppointments: number;
  uniqueClients: number;
  newClientsServiced: number;
  dogsServiced: number;
  rebookRatePercent: number;
  totalNetSalesCents: number;
};

type InHouseGroomingImportReport = {
  groomingAppointments: number;
  groomingAppointmentsInCompletedWindow: number;
  totalPetsServiced: number;
  totalNetSalesCents: number;
  upsellsCents: number;
  ordersCompletedInWindow: number;
};

type DaycareImportReport = {
  totalFinishedAppointments: number;
  totalDaycareAppointments: number;
  totalNonTrainingAppointments: number;
  fullDayDaycareAppointments: number;
  halfDayDaycareAppointments: number;
  fullDayEnrichmentActivityAppointments: number;
  halfDayEnrichmentActivityAppointments: number;
  averageDailyOccupancy: number;
  evaluations: number;
  uniqueClients: number;
  averageVisitsPerClient: number;
  totalNetSalesCents: number;
};

type BoardingImportReport = {
  packageSalesCents: number;
  addonSalesCents: number;
  totalFinishedBoardingAppointments: number;
  totalRevenueCents: number;
  nights: number;
};

type UpcomingBoardingBookingWeek = {
  weekStart: string;
  weekEnding: string;
  nightCount: number;
};

type UpcomingBoardingBookingsReport = {
  generatedAt: string | null;
  windowStart: string;
  windowEnd: string;
  totalNights: number;
  weeks: UpcomingBoardingBookingWeek[];
};

type TrainingImportReport = {
  totalFinishedTrainingAppointments: number;
  trainingAppointmentsInSalesWindow: number;
  trainingEvaluations: number;
  productSalesCents: number;
  groupRevenueCents: number;
  oneOnOneRevenueCents: number;
  ordersInSalesWindow: number;
};

// "week" edits value + average; "targets" edits only targets. Targets can be
// changed *only* via the targets mode.
type EditMode = "week" | "targets" | null;

const SELECT_CLS =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50";

const SECTION_ORDER: KpiSection[] = ["ACTUALS", "FORECAST"];

const ALL_TAB = "ALL";
const DAYCARE_READ_ONLY_VALUE_KEY_SET = new Set<string>(
  DAYCARE_READ_ONLY_VALUE_KEYS
);
const BOARDING_READ_ONLY_VALUE_KEY_SET = new Set<string>(
  BOARDING_READ_ONLY_VALUE_KEYS
);

function withDerivedKpiCells(
  segment: KpiSegment,
  cells: Record<string, KpiCell>
): Record<string, KpiCell> {
  if (segment !== "DAYCARE" && segment !== "BOARDING") return cells;

  const values = Object.fromEntries(
    Object.entries(cells).map(([key, cell]) => [key, cell.value])
  );
  const previousValues = Object.fromEntries(
    Object.entries(cells).map(([key, cell]) => [key, cell.previousValue])
  );
  const derived =
    segment === "DAYCARE"
      ? calculateDaycareDerivedMetricValues(values)
      : calculateBoardingDerivedMetricValues(values);
  const previousDerived =
    segment === "DAYCARE"
      ? calculateDaycareDerivedMetricValues(previousValues)
      : calculateBoardingDerivedMetricValues(previousValues);
  if (Object.keys(derived).length === 0 && Object.keys(previousDerived).length === 0) return cells;

  const next = { ...cells };
  for (const [key, value] of Object.entries(derived)) {
    if (!next[key]) continue;
    next[key] = { ...next[key], value };
  }
  for (const [key, previousValue] of Object.entries(previousDerived)) {
    if (!next[key]) continue;
    next[key] = { ...next[key], previousValue };
  }
  return next;
}

export function KpiView({
  segment,
  week,
  data,
  activeTab,
  allSegmentsData,
}: {
  segment: KpiSegment;
  week: string;
  data: Record<string, KpiCell>;
  activeTab?: string;
  allSegmentsData?: Record<string, Record<string, KpiCell>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const segmentDef = getSegmentDef(segment);
  const isAll = activeTab === ALL_TAB;
  const dataWithDerivedValues = useMemo(
    () => withDerivedKpiCells(segment, data),
    [segment, data]
  );
  const allSegmentsDataWithDerivedValues = useMemo(() => {
    if (!allSegmentsData) return undefined;
    return Object.fromEntries(
      Object.entries(allSegmentsData).map(([key, cells]) => [
        key,
        withDerivedKpiCells(key as KpiSegment, cells),
      ])
    );
  }, [allSegmentsData]);

  const [mode, setMode] = useState<EditMode>(null);
  const [draft, setDraft] = useState<Record<string, KpiCell>>({});
  const [saving, setSaving] = useState(false);
  const [importingMoego, setImportingMoego] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Leave edit mode whenever the server data changes (segment/week switch).
  useEffect(() => {
    setMode(null);
    setImportMessage(null);
  }, [segment, week, isAll]);

  function navigate(nextSegment: string, nextWeek: string) {
    router.push(`${pathname}?segment=${nextSegment}&week=${nextWeek}`);
  }

  function startEdit(nextMode: Exclude<EditMode, null>) {
    const seed: Record<string, KpiCell> = {};
    for (const metric of segmentDef.metrics) {
      seed[metric.key] =
        dataWithDerivedValues[metric.key] ?? {
          value: null,
          previousValue: null,
          average: null,
          target: null,
        };
    }
    setDraft(seed);
    setMode(nextMode);
  }

  function updateDraft(
    metricKey: string,
    field: Exclude<keyof KpiCell, "previousValue">,
    scaled: number | null
  ) {
    setDraft((prev) => ({
      ...prev,
      [metricKey]: { ...prev[metricKey], [field]: scaled },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const draftWithDerivedValues = withDerivedKpiCells(segment, draft);
      const metrics = segmentDef.metrics.map((m) => ({
        metricKey: m.key,
        value: draftWithDerivedValues[m.key]?.value ?? null,
        average: draftWithDerivedValues[m.key]?.average ?? null,
        target: draftWithDerivedValues[m.key]?.target ?? null,
      }));
      const res = await fetch("/api/finance/kpis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, weekStart: week, metrics }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error ?? "Failed to save KPIs");
        return;
      }
      setMode(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function importMoegoActuals() {
    setImportingMoego(true);
    setImportMessage(null);
    try {
      const endpoint =
        segment === "IN_HOUSE_GROOMING"
          ? "/api/finance/kpis/moego-in-house-grooming"
          : segment === "DAYCARE"
            ? "/api/finance/kpis/moego-daycare"
            : segment === "BOARDING"
              ? "/api/finance/kpis/moego-boarding"
              : segment === "TRAINING"
                ? "/api/finance/kpis/moego-training"
              : "/api/finance/kpis/moego-mobile-grooming";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: week }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        report?:
          | MobileGroomingImportReport
          | InHouseGroomingImportReport
          | DaycareImportReport
          | BoardingImportReport
          | TrainingImportReport;
      };
      if (!res.ok || !json.report) {
        setImportMessage(json.error ?? "Failed to import MoeGo actuals");
        return;
      }
      const importedAt = formatImportedAt();
      if (segment === "IN_HOUSE_GROOMING") {
        const report = json.report as InHouseGroomingImportReport;
        setImportMessage(
          withImportedAt(
            `Imported ${report.totalPetsServiced} pets serviced, ${dollars(report.totalNetSalesCents)} grooming net sales, and ${dollars(report.upsellsCents)} upsells from ${report.ordersCompletedInWindow} completed grooming orders in the selected week.`,
            importedAt
          )
        );
      } else if (segment === "DAYCARE") {
        const report = json.report as DaycareImportReport;
        const fullDayDaycareAppointments =
          report.fullDayDaycareAppointments ?? report.totalNonTrainingAppointments;
        setImportMessage(
          withImportedAt(
            `Imported ${report.totalDaycareAppointments} total daycare appointments, ${fullDayDaycareAppointments} full day daycare appointments, ${report.halfDayDaycareAppointments} half day daycare appointments, ${report.fullDayEnrichmentActivityAppointments} full day enrichment activity appointments, ${report.halfDayEnrichmentActivityAppointments} half day enrichment activity appointments, ${report.evaluations} evaluations, ${report.averageDailyOccupancy.toFixed(2)} average daily occupancy, ${report.uniqueClients} clients, ${report.averageVisitsPerClient.toFixed(2)} average visits, and ${dollars(report.totalNetSalesCents)} net sales from ${report.totalFinishedAppointments} finished daycare appointments.`,
            importedAt
          )
        );
      } else if (segment === "TRAINING") {
        const report = json.report as TrainingImportReport;
        setImportMessage(
          withImportedAt(
            `Imported ${report.trainingEvaluations} training evaluations, ${dollars(report.productSalesCents)} product sales, ${dollars(report.groupRevenueCents)} group class net sales, and ${dollars(report.oneOnOneRevenueCents)} one-on-one training net sales from ${report.ordersInSalesWindow} training sales in the selected week.`,
            importedAt
          )
        );
      } else if (segment === "BOARDING") {
        const report = json.report as BoardingImportReport;
        setImportMessage(
          withImportedAt(
            `Imported ${report.totalFinishedBoardingAppointments} finished boarding appointments, ${dollars(report.totalRevenueCents)} revenue, ${dollars(report.packageSalesCents)} packages, ${dollars(report.addonSalesCents)} addons, and ${report.nights} nights.`,
            importedAt
          )
        );
      } else {
        const report = json.report as MobileGroomingImportReport;
        setImportMessage(
          withImportedAt(
            `Imported ${report.uniqueClients} clients, ${report.newClientsServiced} new clients, ${report.dogsServiced} dogs, ${report.rebookRatePercent.toFixed(1)}% rebook rate, and ${dollars(report.totalNetSalesCents)} net revenue from ${report.finishedAppointments} finished appointments.`,
            importedAt
          )
        );
      }
      router.refresh();
    } finally {
      setImportingMoego(false);
    }
  }

  const hasMetrics = segmentDef.metrics.length > 0;
  const canImportMoego =
    (segment === "MOBILE_GROOMING" ||
      segment === "BOARDING" ||
      segment === "IN_HOUSE_GROOMING" ||
      segment === "DAYCARE" ||
      segment === "TRAINING") &&
    hasMetrics;

  function exportCsv() {
    if (!allSegmentsDataWithDerivedValues) return;
    const rows: string[][] = [
      ["Segment", "Section", "KPI", "Value", "Last Week", "WoW", "Average", "Target"],
    ];
    for (const segDef of KPI_SEGMENTS) {
      const segData = allSegmentsDataWithDerivedValues[segDef.key];
      if (!segData) continue;
      for (const section of SECTION_ORDER) {
        if (isNotWorkingSection(segDef.key, section)) continue;
        const metrics = segDef.metrics.filter((m) => m.section === section);
        for (const metric of metrics) {
          const cell = segData[metric.key];
          rows.push([
            segDef.label,
            section,
            metric.label,
            formatKpiValue(cell?.value ?? null, metric.format),
            formatKpiValue(cell?.previousValue ?? null, metric.format),
            formatComparisonForCsv(
              cell?.value ?? null,
              cell?.previousValue ?? null,
              metric.format
            ),
            formatKpiValue(cell?.average ?? null, metric.format),
            formatKpiValue(cell?.target ?? null, metric.format),
          ]);
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpis-all-${week}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allTabs = [
    ...KPI_SEGMENTS.map((s) => ({ id: s.key, label: s.label })),
    { id: ALL_TAB, label: "All" },
  ];

  return (
    <div>
      <Tabs
        tabs={allTabs}
        activeTab={isAll ? ALL_TAB : segment}
        onChange={(id) => navigate(id, week)}
        className="mb-6"
      />

      {isAll ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <WeekPicker week={week} onChange={(w) => navigate(ALL_TAB, w)} />
            <div className="flex gap-2 print:hidden">
              <Button variant="secondary" onClick={exportCsv}>
                Export CSV
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                Print / PDF
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-8 print:gap-4">
            {KPI_SEGMENTS.map((segDef) => {
              const segData = allSegmentsDataWithDerivedValues?.[segDef.key];
              if (!segData || segDef.metrics.length === 0) return null;
              return (
                <section key={segDef.key}>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3 print:text-base">
                    {segDef.label}
                  </h2>
                  <div className="flex flex-col gap-4">
                    {SECTION_ORDER.map((section) => {
                      if (isNotWorkingSection(segDef.key, section)) return null;
                      const metrics = segDef.metrics.filter((m) => m.section === section);
                      if (metrics.length === 0) return null;
                      return (
                        <div key={section}>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                            {sectionLabel(segDef.key, section)}
                          </h3>
                          <Table>
                            <TableHead>
                              <tr>
                                <TableHeader className="w-12">#</TableHeader>
                                <TableHeader>KPI</TableHeader>
                                <TableHeader className="text-right">Value</TableHeader>
                                <TableHeader className="text-right">Last Week</TableHeader>
                                <TableHeader className="text-right">WoW</TableHeader>
                                <TableHeader className="text-right">Average</TableHeader>
                                <TableHeader className="text-right">Target</TableHeader>
                              </tr>
                            </TableHead>
                            <TableBody>
                              {metrics.map((metric, idx) => {
                                const cell = segData[metric.key];
                                return (
                                  <TableRow key={metric.key}>
                                    <TableCell className="text-gray-400">{idx + 1}</TableCell>
                                    <TableCell className="font-medium">{metric.label}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatKpiValue(cell?.value ?? null, metric.format)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatKpiValue(cell?.previousValue ?? null, metric.format)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      <KpiComparison
                                        value={cell?.value ?? null}
                                        previousValue={cell?.previousValue ?? null}
                                        format={metric.format}
                                      />
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatKpiValue(cell?.average ?? null, metric.format)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatKpiValue(cell?.target ?? null, metric.format)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
            <WeekPicker week={week} onChange={(w) => navigate(segment, w)} />
            {hasMetrics &&
              (mode ? (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setMode(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Saving…" : mode === "targets" ? "Save targets" : "Save week"}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {canImportMoego && (
                    <Button
                      variant="secondary"
                      onClick={importMoegoActuals}
                      disabled={importingMoego}
                    >
                      {importingMoego ? "Importing…" : "Import MoeGo actuals"}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => startEdit("week")}>
                    Edit week
                  </Button>
                  <Button variant="secondary" onClick={() => startEdit("targets")}>
                    Edit targets
                  </Button>
                </div>
              ))}
          </div>

          {mode === "week" && (
            <p className="-mt-3 mb-6 text-xs text-gray-500">
              Value is saved for this week only. Targets and averages are edited separately.
            </p>
          )}
          {mode === "targets" && (
            <p className="-mt-3 mb-6 text-xs text-gray-500">
              Targets and averages apply from this week forward, in perpetuity until you change them
              again — past weeks are not affected — and also fill the matching {sectionLabel(segment, "FORECAST")}
              rows.
            </p>
          )}
          {importMessage && (
            <div className="-mt-3 mb-6 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {importMessage}
            </div>
          )}

          {!hasMetrics ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon="📊"
                  title={`${segmentDef.label} KPIs coming soon`}
                  description="This segment's KPIs haven't been defined yet. Once they are, weekly data will appear here."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-8">
              {SECTION_ORDER.map((section) => {
                if (isNotWorkingSection(segment, section)) return null;
                const metrics = segmentDef.metrics.filter((m) => m.section === section);
                if (metrics.length === 0) {
                  return null;
                }
                return (
                  <section key={section}>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                      {sectionLabel(segment, section)}
                    </h2>
                    <Table>
                      <TableHead>
                        <tr>
                          <TableHeader className="w-12">#</TableHeader>
                          <TableHeader>KPI</TableHeader>
                          <TableHeader className="text-right">Value</TableHeader>
                          <TableHeader className="text-right">Last Week</TableHeader>
                          <TableHeader className="text-right">WoW</TableHeader>
                          <TableHeader className="text-right">Average</TableHeader>
                          <TableHeader className="text-right">Target</TableHeader>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {metrics.map((metric, idx) => {
                          const isMirror = Boolean(metric.mirrorsKey);
                          const activeCells = mode
                            ? withDerivedKpiCells(segment, draft)
                            : dataWithDerivedValues;
                          const value = activeCells[metric.key]?.value ?? null;
                          const previousValue =
                            dataWithDerivedValues[metric.key]?.previousValue ?? null;
                          const valueIsReadOnly =
                            (segment === "DAYCARE" &&
                              DAYCARE_READ_ONLY_VALUE_KEY_SET.has(metric.key)) ||
                            (segment === "BOARDING" &&
                              BOARDING_READ_ONLY_VALUE_KEY_SET.has(metric.key));
                          return (
                            <TableRow key={metric.key}>
                              <TableCell className="text-gray-400">{idx + 1}</TableCell>
                              <TableCell className="font-medium">{metric.label}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {mode === "week" && !valueIsReadOnly ? (
                                  <KpiInput
                                    format={metric.format}
                                    scaled={value}
                                    onChange={(v) => updateDraft(metric.key, "value", v)}
                                  />
                                ) : (
                                  formatKpiValue(value, metric.format)
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatKpiValue(previousValue, metric.format)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <KpiComparison
                                  value={value}
                                  previousValue={previousValue}
                                  format={metric.format}
                                />
                              </TableCell>
                              {(["average", "target"] as const).map((field) => {
                                const editable = mode === "targets" && !isMirror;
                                const scaled =
                                  isMirror
                                    ? (mode === "targets"
                                        ? draft[metric.mirrorsKey ?? metric.key]?.[field]
                                        : dataWithDerivedValues[metric.key]?.[field]) ?? null
                                    : activeCells[metric.key]?.[field] ?? null;
                                return (
                                  <TableCell key={field} className="text-right tabular-nums">
                                    {editable ? (
                                      <KpiInput
                                        format={metric.format}
                                        scaled={scaled}
                                        onChange={(v) => updateDraft(metric.key, field, v)}
                                      />
                                    ) : (
                                      formatKpiValue(scaled, metric.format)
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </section>
                );
              })}
              {segment === "BOARDING" && <UpcomingBoardingBookingsSection />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UpcomingBoardingBookingsSection() {
  const [report, setReport] = useState<UpcomingBoardingBookingsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          "/api/finance/kpis/moego-boarding/upcoming-bookings",
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          report?: UpcomingBoardingBookingsReport;
        };
        if (!active) return;
        if (!res.ok || !json.report) {
          setError(json.error ?? "Could not load upcoming boarding bookings.");
          setReport(null);
          return;
        }
        setReport(json.report);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load upcoming boarding bookings.");
        setReport(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function updateUpcomingNights() {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/finance/kpis/moego-boarding/upcoming-bookings",
        {
          method: "POST",
          cache: "no-store",
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        report?: UpcomingBoardingBookingsReport;
      };
      if (!res.ok || !json.report) {
        setError(json.error ?? "Could not update upcoming boarding nights.");
        return;
      }
      setReport(json.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update upcoming boarding nights.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Upcoming Boarding Nights
          </h2>
          <div className="mt-1 text-xs text-gray-500">
            {report?.generatedAt
              ? `Updated ${formatImportedAt(new Date(report.generatedAt))}`
              : "Stored snapshot has not been updated yet"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {report && (
            <div className="text-xs text-gray-500">
              {report.totalNights.toLocaleString("en-US")} total nights
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={updateUpcomingNights}
            disabled={updating}
          >
            {updating ? "Updating..." : "Update"}
          </Button>
        </div>
      </div>
      <Table>
        <TableHead>
          <tr>
            <TableHeader>Week Ending</TableHeader>
            <TableHeader className="text-right">Nights</TableHeader>
          </tr>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={2} className="text-gray-500">
                Loading upcoming boarding nights...
              </TableCell>
            </TableRow>
          ) : error ? (
            <TableRow>
              <TableCell colSpan={2} className="text-amber-700">
                {error}
              </TableCell>
            </TableRow>
          ) : report && report.weeks.length > 0 ? (
            report.weeks.map((week) => (
              <TableRow key={week.weekStart}>
                <TableCell className="font-medium">
                  {formatDateOnly(week.weekEnding)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {week.nightCount.toLocaleString("en-US")}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={2} className="text-gray-500">
                No upcoming bookings found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function formatDateOnly(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function comparisonParts(
  value: number | null,
  previousValue: number | null,
  format: KpiFormat
): { delta: number; deltaLabel: string; detail: string | null } | null {
  if (value === null || previousValue === null) return null;

  const delta = value - previousValue;
  const deltaLabel = formatSignedKpiValue(delta, format);
  let detail: string | null = null;

  if (previousValue === 0) {
    detail = delta === 0 ? "0.0%" : "from 0";
  } else {
    const percentChange = (delta / Math.abs(previousValue)) * 100;
    detail = `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}%`;
  }

  return { delta, deltaLabel, detail };
}

function formatSignedKpiValue(delta: number, format: KpiFormat): string {
  if (delta === 0) return formatKpiValue(0, format);
  return `${delta > 0 ? "+" : "-"}${formatKpiValue(Math.abs(delta), format)}`;
}

function formatComparisonForCsv(
  value: number | null,
  previousValue: number | null,
  format: KpiFormat
): string {
  const parts = comparisonParts(value, previousValue, format);
  if (!parts) return "";
  return parts.detail ? `${parts.deltaLabel} (${parts.detail})` : parts.deltaLabel;
}

function KpiComparison({
  value,
  previousValue,
  format,
}: {
  value: number | null;
  previousValue: number | null;
  format: KpiFormat;
}) {
  const parts = comparisonParts(value, previousValue, format);
  if (!parts) return <span className="text-gray-400">—</span>;

  const tone =
    parts.delta > 0
      ? "text-blue-700"
      : parts.delta < 0
        ? "text-amber-700"
        : "text-gray-500";

  return (
    <span className={`inline-flex flex-col items-end leading-tight ${tone}`}>
      <span>{parts.deltaLabel}</span>
      {parts.detail && <span className="text-[11px] text-gray-400">{parts.detail}</span>}
    </span>
  );
}

function formatImportedAt(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function withImportedAt(message: string, importedAt: string): string {
  return `${message} Imported at ${importedAt}.`;
}

function sectionLabel(segment: KpiSegment, section: KpiSection): string {
  if (segment === "BOARDING" && section === "FORECAST") {
    return "NOT WORKING";
  }
  if (segment === "DAYCARE" && section === "FORECAST") {
    return "NOT WORKING";
  }
  return SECTION_LABELS[section];
}

function isNotWorkingSection(segment: KpiSegment, section: KpiSection): boolean {
  return section === "FORECAST" && (segment === "BOARDING" || segment === "DAYCARE");
}

function KpiInput({
  format,
  scaled,
  onChange,
}: {
  format: KpiFormat;
  scaled: number | null;
  onChange: (scaled: number | null) => void;
}) {
  const display = scaled === null ? "" : (scaled / 100).toString();
  return (
    <div className="relative inline-block">
      {format === "currency" && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
      )}
      <input
        type="number"
        step="any"
        min="0"
        value={display}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") {
            onChange(null);
            return;
          }
          const num = parseFloat(v);
          onChange(Number.isNaN(num) ? null : Math.round(num * 100));
        }}
        className={`w-28 rounded-lg border border-gray-300 bg-white py-1.5 text-right text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          format === "currency" ? "pl-5 pr-6" : format === "percent" ? "pl-3 pr-6" : "px-3"
        }`}
        placeholder="—"
      />
      {format === "percent" && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
      )}
    </div>
  );
}

function WeekPicker({ week, onChange }: { week: string; onChange: (week: string) => void }) {
  const selectedDate = useMemo(() => fromWeekParam(week), [week]);
  const recent = useMemo(() => recentWeeks(12), []);
  const recentParams = useMemo(() => recent.map(toWeekParam), [recent]);

  const [year, setYear] = useState(selectedDate.getUTCFullYear());
  const [month, setMonth] = useState(selectedDate.getUTCMonth());

  // Keep the cascade in sync with the selected week (e.g. after a recent pick).
  useEffect(() => {
    setYear(selectedDate.getUTCFullYear());
    setMonth(selectedDate.getUTCMonth());
  }, [selectedDate]);

  const years = useMemo(() => yearsRange(), []);
  const months = monthsForYear();
  const weeks = useMemo(() => weeksInMonth(year, month), [year, month]);
  const weekInCascade = weeks.some((d) => toWeekParam(d) === week) ? week : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-semibold text-gray-900">
        {formatWeekLabel(selectedDate)}
        <span className="ml-2 font-normal text-gray-400">{formatWeekRange(selectedDate)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Recent weeks"
          className={SELECT_CLS}
          value={recentParams.includes(week) ? week : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        >
          <option value="">Recent weeks…</option>
          {recent.map((d, i) => (
            <option key={recentParams[i]} value={recentParams[i]}>
              {formatWeekLabel(d)}
            </option>
          ))}
        </select>

        <span className="text-xs text-gray-400">or jump to</span>

        <select
          aria-label="Year"
          className={SELECT_CLS}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          aria-label="Month"
          className={SELECT_CLS}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {MONTH_NAMES[m]}
            </option>
          ))}
        </select>
        <select
          aria-label="Week"
          className={SELECT_CLS}
          value={weekInCascade}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        >
          <option value="">Week…</option>
          {weeks.map((d) => {
            const param = toWeekParam(d);
            return (
              <option key={param} value={param}>
                {formatWeekRange(d)}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
