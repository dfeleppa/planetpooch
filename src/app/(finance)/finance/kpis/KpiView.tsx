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
  KPI_SEGMENTS,
  SECTION_LABELS,
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
  average: number | null;
  target: number | null;
};

type MobileGroomingImportReport = {
  finishedAppointments: number;
  uniqueClients: number;
  dogsServiced: number;
  rebookRatePercent: number;
  totalNetSalesCents: number;
};

type InHouseGroomingImportReport = {
  groomingAppointments: number;
  totalPetsServiced: number;
  totalNetSalesCents: number;
  upsellsCents: number;
};

type DaycareImportReport = {
  totalFinishedAppointments: number;
  totalNonTrainingAppointments: number;
  uniqueClients: number;
  averageVisitsPerClient: number;
  totalNetSalesCents: number;
};


// "week" edits value + average; "targets" edits only targets. Targets can be
// changed *only* via the targets mode.
type EditMode = "week" | "targets" | null;

const SELECT_CLS =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50";

const SECTION_ORDER: KpiSection[] = ["ACTUALS", "FORECAST"];

export function KpiView({
  segment,
  week,
  data,
}: {
  segment: KpiSegment;
  week: string;
  data: Record<string, KpiCell>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const segmentDef = getSegmentDef(segment);

  const [mode, setMode] = useState<EditMode>(null);
  const [draft, setDraft] = useState<Record<string, KpiCell>>({});
  const [saving, setSaving] = useState(false);
  const [importingMoego, setImportingMoego] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Leave edit mode whenever the server data changes (segment/week switch).
  useEffect(() => {
    setMode(null);
    setImportMessage(null);
  }, [segment, week]);

  function navigate(nextSegment: string, nextWeek: string) {
    router.push(`${pathname}?segment=${nextSegment}&week=${nextWeek}`);
  }

  function startEdit(nextMode: Exclude<EditMode, null>) {
    const seed: Record<string, KpiCell> = {};
    for (const metric of segmentDef.metrics) {
      seed[metric.key] = data[metric.key] ?? { value: null, average: null, target: null };
    }
    setDraft(seed);
    setMode(nextMode);
  }

  function updateDraft(metricKey: string, field: keyof KpiCell, scaled: number | null) {
    setDraft((prev) => ({
      ...prev,
      [metricKey]: { ...prev[metricKey], [field]: scaled },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const metrics = segmentDef.metrics.map((m) => ({
        metricKey: m.key,
        value: draft[m.key]?.value ?? null,
        average: draft[m.key]?.average ?? null,
        target: draft[m.key]?.target ?? null,
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
          | DaycareImportReport;
      };
      if (!res.ok || !json.report) {
        setImportMessage(json.error ?? "Failed to import MoeGo actuals");
        return;
      }
      if (segment === "IN_HOUSE_GROOMING") {
        const report = json.report as InHouseGroomingImportReport;
        setImportMessage(
          `Imported ${report.totalPetsServiced} pets serviced, ${dollars(report.totalNetSalesCents)} grooming revenue, and ${dollars(report.upsellsCents)} upsells from ${report.groomingAppointments} finished grooming appointments.`
        );
      } else if (segment === "DAYCARE") {
        const report = json.report as DaycareImportReport;
        setImportMessage(
          `Imported ${report.totalNonTrainingAppointments} non-training daycare appointments, ${report.uniqueClients} clients, ${report.averageVisitsPerClient.toFixed(2)} average visits, and ${dollars(report.totalNetSalesCents)} net sales from ${report.totalFinishedAppointments} finished daycare appointments.`
        );
      } else {
        const report = json.report as MobileGroomingImportReport;
        setImportMessage(
          `Imported ${report.uniqueClients} clients, ${report.dogsServiced} dogs, ${report.rebookRatePercent.toFixed(1)}% rebook rate, and ${dollars(report.totalNetSalesCents)} net revenue from ${report.finishedAppointments} finished appointments.`
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
      segment === "IN_HOUSE_GROOMING" ||
      segment === "DAYCARE") &&
    hasMetrics;

  return (
    <div>
      <Tabs
        tabs={KPI_SEGMENTS.map((s) => ({ id: s.key, label: s.label }))}
        activeTab={segment}
        onChange={(id) => navigate(id, week)}
        className="mb-6"
      />

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
          again — past weeks are not affected — and also fill the matching Next Week — Forecast
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
            const metrics = segmentDef.metrics.filter((m) => m.section === section);
            if (metrics.length === 0) return null;
            return (
              <section key={section}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  {SECTION_LABELS[section]}
                </h2>
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeader className="w-12">#</TableHeader>
                      <TableHeader>KPI</TableHeader>
                      <TableHeader className="text-right">Value</TableHeader>
                      <TableHeader className="text-right">Average</TableHeader>
                      <TableHeader className="text-right">Target</TableHeader>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {metrics.map((metric, idx) => {
                      const isMirror = Boolean(metric.mirrorsKey);
                      return (
                        <TableRow key={metric.key}>
                          <TableCell className="text-gray-400">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{metric.label}</TableCell>
                          {(["value", "average", "target"] as const).map((field) => {
                            // value is edited in "week" mode; target & average in
                            // "targets" mode. Forecast (mirror) rows derive their
                            // target/average from their source, so they're never
                            // directly editable — they preview the source's live draft.
                            const editable =
                              (mode === "week" && field === "value") ||
                              (mode === "targets" && field !== "value" && !isMirror);
                            const scaled =
                              isMirror && field !== "value"
                                ? (mode === "targets"
                                    ? draft[metric.mirrorsKey ?? metric.key]?.[field]
                                    : data[metric.key]?.[field]) ?? null
                                : (mode ? draft[metric.key] : data[metric.key])?.[field] ?? null;
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
        </div>
      )}
    </div>
  );
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
