"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { KpiSegment } from "@prisma/client";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/Table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatKpiValue } from "@/lib/utils";
import {
  KPI_SEGMENTS,
  SECTION_LABELS,
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

type KpiCell = {
  value: number | null;
  average: number | null;
  target: number | null;
};

export type AllKpisData = Record<string, Record<string, KpiCell>>;

const SELECT_CLS =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50";

const SECTION_ORDER: KpiSection[] = ["ACTUALS", "FORECAST"];

function sectionLabel(segment: KpiSegment, section: KpiSection): string {
  if (segment === "DAYCARE" && section === "FORECAST") {
    return "Future KPI Card";
  }
  return SECTION_LABELS[section];
}

export function AllKpisView({
  week,
  segments,
}: {
  week: string;
  segments: AllKpisData;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(nextWeek: string) {
    router.push(`${pathname}?week=${nextWeek}`);
  }

  function exportCsv() {
    const rows: string[][] = [["Segment", "Section", "KPI", "Value", "Average", "Target"]];
    for (const segDef of KPI_SEGMENTS) {
      const data = segments[segDef.key];
      if (!data) continue;
      for (const section of SECTION_ORDER) {
        const metrics = segDef.metrics.filter((m) => m.section === section);
        for (const metric of metrics) {
          const cell = data[metric.key];
          rows.push([
            segDef.label,
            section,
            metric.label,
            formatKpiValue(cell?.value ?? null, metric.format),
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

  function exportPdf() {
    window.print();
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <WeekPicker week={week} onChange={navigate} />
        <div className="flex gap-2">
          <Link href={`/finance/kpis?week=${week}`}>
            <Button variant="secondary">Per-segment view</Button>
          </Link>
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={exportPdf}>
            Print / PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-8 print:gap-4">
        {KPI_SEGMENTS.map((segDef) => {
          const data = segments[segDef.key];
          if (!data) return null;

          const hasMetrics = segDef.metrics.length > 0;
          if (!hasMetrics) return null;

          return (
            <section key={segDef.key}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3 print:text-base">
                {segDef.label}
              </h2>
              <div className="flex flex-col gap-4">
                {SECTION_ORDER.map((section) => {
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
                            <TableHeader className="text-right">Average</TableHeader>
                            <TableHeader className="text-right">Target</TableHeader>
                          </tr>
                        </TableHead>
                        <TableBody>
                          {metrics.map((metric, idx) => {
                            const cell = data[metric.key];
                            return (
                              <TableRow key={metric.key}>
                                <TableCell className="text-gray-400">{idx + 1}</TableCell>
                                <TableCell className="font-medium">{metric.label}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatKpiValue(cell?.value ?? null, metric.format)}
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
    </div>
  );
}

function WeekPicker({ week, onChange }: { week: string; onChange: (week: string) => void }) {
  const selectedDate = useMemo(() => fromWeekParam(week), [week]);
  const recent = useMemo(() => recentWeeks(12), []);
  const recentParams = useMemo(() => recent.map(toWeekParam), [recent]);

  const [year, setYear] = useState(selectedDate.getUTCFullYear());
  const [month, setMonth] = useState(selectedDate.getUTCMonth());

  useEffect(() => {
    setYear(selectedDate.getUTCFullYear());
    setMonth(selectedDate.getUTCMonth());
  }, [selectedDate]);

  const years = useMemo(() => yearsRange(), []);
  const months = monthsForYear();
  const weeks = useMemo(() => weeksInMonth(year, month), [year, month]);
  const weekInCascade = weeks.some((d) => toWeekParam(d) === week) ? week : "";

  return (
    <div className="flex flex-col gap-2 print:hidden">
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
          <option value="">Recent weeks...</option>
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
          <option value="">Week...</option>
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
