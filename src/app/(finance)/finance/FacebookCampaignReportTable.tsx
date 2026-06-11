"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ROWS_PER_PAGE = 8;

type CampaignReportRow = {
  id?: string;
  clientId: string;
  campaignId: string;
  campaign: string;
  status: string;
  clicks: number | null;
  costCents: number | null;
  revenueCents: number | null;
  roiPercent: number | null;
  cpcCents: number | null;
  ctrPercent: number | null;
  sales: number | null;
  cpsCents: number | null;
  leads: number | null;
  cplCents: number | null;
  impressions: number | null;
  averageRevenueCents: number | null;
};

type ApiCampaignReportRow = {
  id: string;
  campaignId: string | null;
  campaign: string;
  status: string | null;
  clicks: number | null;
  costCents: number | null;
  revenueCents: number | null;
  roiPercent: number | null;
  cpcCents: number | null;
  ctrPercent: number | null;
  sales: number | null;
  cpsCents: number | null;
  leads: number | null;
  cplCents: number | null;
  impressions: number | null;
  averageRevenueCents: number | null;
};

function normalizeApiRow(row: ApiCampaignReportRow): CampaignReportRow {
  return {
    ...row,
    clientId: row.id,
    campaignId: row.campaignId ?? "",
    status: row.status ?? "",
  };
}

function formatText(value: string | null | undefined): string {
  return value?.trim() ? value : "-";
}

function formatInteger(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("en-US");
}

function formatMoney(value: number | null): string {
  if (value === null) return "-";
  return (value / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${(value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function sumRows(
  rows: CampaignReportRow[],
  field: keyof Pick<
    CampaignReportRow,
    | "clicks"
    | "costCents"
    | "revenueCents"
    | "sales"
    | "leads"
    | "impressions"
  >
): number {
  return rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
}

function divideToCents(numeratorCents: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(numeratorCents / denominator) : null;
}

function percentTimes100(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) : null;
}

function CampaignReportTable({
  title,
  apiPath,
  csvLabel,
  business,
  from,
  to,
}: {
  title: string;
  apiPath: string;
  csvLabel: string;
  business: string;
  from: string;
  to: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CampaignReportRow[]>([]);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const businessKey = business || "all-businesses";

  const loadRows = useCallback(async () => {
    if (!from || !to) return;

    setLoaded(false);
    setSaved(false);
    setError(null);

    const params = new URLSearchParams({
      business: businessKey,
      from,
      to,
    });

    try {
      const res = await fetch(`${apiPath}?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ApiCampaignReportRow[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Unable to load campaign rows.");
      }

      setRows(Array.isArray(json.rows) ? json.rows.map(normalizeApiRow) : []);
      setPage(0);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Unable to load campaign rows.");
    } finally {
      setLoaded(true);
    }
  }, [apiPath, businessKey, from, to]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);

  useEffect(() => {
    setPage((value) => Math.min(value, pageCount - 1));
  }, [pageCount]);

  const visibleRows = useMemo(() => {
    const start = currentPage * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [currentPage, rows]);
  const totals = useMemo(() => {
    const clicks = sumRows(rows, "clicks");
    const costCents = sumRows(rows, "costCents");
    const revenueCents = sumRows(rows, "revenueCents");
    const sales = sumRows(rows, "sales");
    const leads = sumRows(rows, "leads");
    const impressions = sumRows(rows, "impressions");

    return {
      clicks,
      costCents,
      revenueCents,
      roiPercent: percentTimes100(revenueCents, costCents),
      cpcCents: divideToCents(costCents, clicks),
      ctrPercent: percentTimes100(clicks, impressions),
      sales,
      cpsCents: divideToCents(costCents, sales),
      leads,
      cplCents: divideToCents(costCents, leads),
      impressions,
      averageRevenueCents: divideToCents(revenueCents, sales),
    };
  }, [rows]);

  async function importCsv() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !from || !to) {
      setError("Choose a CSV file before importing.");
      return;
    }

    setImporting(true);
    setSaved(false);
    setError(null);

    const form = new FormData();
    form.append("business", businessKey);
    form.append("periodStart", from);
    form.append("periodEnd", to);
    form.append("file", file);

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ApiCampaignReportRow[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? `Unable to import ${csvLabel} CSV.`);
      }

      setRows(Array.isArray(json.rows) ? json.rows.map(normalizeApiRow) : []);
      setPage(0);
      setSaved(true);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import campaign CSV.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="mt-6 overflow-hidden rounded-lg shadow-none">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 max-w-56 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
            <span className="truncate">{fileName || "Choose CSV"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
              aria-label={`Choose ${csvLabel} campaign CSV`}
            />
          </label>
          <button
            type="button"
            onClick={importCsv}
            disabled={importing || !from || !to}
            className="h-10 rounded-lg border border-blue-600 bg-white px-4 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
        </div>
      </div>

      {(error || saved) && (
        <div
          className={cn(
            "border-b px-4 py-2 text-sm",
            error
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-green-100 bg-green-50 text-green-700"
          )}
          role={error ? "alert" : "status"}
        >
          {error || "Campaign report imported."}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[1660px] w-full table-fixed border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-900">
            <tr className="border-b border-gray-200">
              <th className="w-[165px] px-4 py-3">Id</th>
              <th className="w-[270px] px-3 py-3">Campaign</th>
              <th className="w-[120px] px-3 py-3">Status</th>
              <th className="w-[95px] px-3 py-3 text-right">Clicks</th>
              <th className="w-[120px] px-3 py-3 text-right">Cost</th>
              <th className="w-[130px] px-3 py-3 text-right">Revenue</th>
              <th className="w-[105px] px-3 py-3 text-right">ROI %</th>
              <th className="w-[105px] px-3 py-3 text-right">CPC</th>
              <th className="w-[105px] px-3 py-3 text-right">CTR</th>
              <th className="w-[90px] px-3 py-3 text-right">Sales</th>
              <th className="w-[105px] px-3 py-3 text-right">CPS</th>
              <th className="w-[90px] px-3 py-3 text-right">Leads</th>
              <th className="w-[105px] px-3 py-3 text-right">CPL</th>
              <th className="w-[120px] px-3 py-3 text-right">Impressions</th>
              <th className="w-[140px] px-3 py-3 text-right">Average Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {!loaded ? (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-sm text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-sm text-gray-400">
                  No campaign rows for this period.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.clientId} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 align-middle text-gray-900 tabular-nums">
                    {formatText(row.campaignId)}
                  </td>
                  <td className="px-3 py-3 align-middle text-gray-900">
                    {formatText(row.campaign)}
                  </td>
                  <td className="px-3 py-3 align-middle text-gray-900">
                    {formatText(row.status)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatInteger(row.clicks)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.costCents)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.revenueCents)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatPercent(row.roiPercent)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.cpcCents)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatPercent(row.ctrPercent)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatInteger(row.sales)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.cpsCents)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatInteger(row.leads)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.cplCents)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatInteger(row.impressions)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.averageRevenueCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {loaded && rows.length > 0 && (
            <tfoot className="border-t border-gray-300 bg-gray-50 font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-3 align-middle" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatInteger(totals.clicks)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(totals.costCents)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(totals.revenueCents)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatPercent(totals.roiPercent)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(totals.cpcCents)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatPercent(totals.ctrPercent)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatInteger(totals.sales)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(totals.cpsCents)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatInteger(totals.leads)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(totals.cplCents)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatInteger(totals.impressions)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(totals.averageRevenueCents)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
        <p className="text-sm text-gray-500">
          {rows.length.toLocaleString("en-US")} rows
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={currentPage === 0}
            className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="grid h-9 min-w-9 place-items-center rounded-md border border-blue-600 px-3 text-sm font-medium text-blue-600">
            {currentPage + 1}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            disabled={currentPage >= pageCount - 1}
            className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
}

export function FacebookCampaignReportTable({
  business,
  from,
  to,
}: {
  business: string;
  from: string;
  to: string;
}) {
  return (
    <CampaignReportTable
      title="Facebook Campaign Report"
      apiPath="/api/finance/facebook-campaign-report"
      csvLabel="Facebook"
      business={business}
      from={from}
      to={to}
    />
  );
}

export function GoogleCampaignReportTable({
  business,
  from,
  to,
}: {
  business: string;
  from: string;
  to: string;
}) {
  return (
    <CampaignReportTable
      title="Google Campaign Report"
      apiPath="/api/finance/google-campaign-report"
      csvLabel="Google"
      business={business}
      from={from}
      to={to}
    />
  );
}
