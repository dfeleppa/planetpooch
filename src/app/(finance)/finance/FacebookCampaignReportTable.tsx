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

function newClientId(): string {
  return `campaign-row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankRow(): CampaignReportRow {
  return {
    clientId: newClientId(),
    campaignId: "",
    campaign: "",
    status: "",
    clicks: null,
    costCents: null,
    revenueCents: null,
    roiPercent: null,
    cpcCents: null,
    ctrPercent: null,
    sales: null,
    cpsCents: null,
    leads: null,
    cplCents: null,
    impressions: null,
    averageRevenueCents: null,
  };
}

function normalizeApiRow(row: ApiCampaignReportRow): CampaignReportRow {
  return {
    ...row,
    clientId: row.id,
    campaignId: row.campaignId ?? "",
    status: row.status ?? "",
  };
}

function toInputRows(rows: CampaignReportRow[]) {
  return rows.map((row) => {
    const { clientId, id, ...input } = row;
    void clientId;
    void id;
    return input;
  });
}

function parseIntegerInput(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value.replace(/[,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function parseScaledInput(value: string, scale: number): number | null {
  if (value === "") return null;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * scale);
}

function centsToInput(value: number | null): string {
  return value === null ? "" : (value / 100).toString();
}

function percentToInput(value: number | null): string {
  return value === null ? "" : (value / 100).toString();
}

function inputClass(className?: string) {
  return cn(
    "h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-900 outline-none transition-colors",
    "hover:border-gray-200 hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100",
    className
  );
}

function MoneyInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">
        $
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={centsToInput(value)}
        onChange={(event) => onChange(parseScaledInput(event.target.value, 100))}
        className={inputClass("pl-6 text-right tabular-nums")}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        step="0.01"
        value={percentToInput(value)}
        onChange={(event) => onChange(parseScaledInput(event.target.value, 100))}
        className={inputClass("pr-7 text-right tabular-nums")}
        aria-label={ariaLabel}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">
        %
      </span>
    </div>
  );
}

function IntegerInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min="0"
      step="1"
      value={value ?? ""}
      onChange={(event) => onChange(parseIntegerInput(event.target.value))}
      className={inputClass("text-right tabular-nums")}
      aria-label={ariaLabel}
    />
  );
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
  const [saving, setSaving] = useState(false);
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

  function updateRow(
    visibleIndex: number,
    patch: Partial<Omit<CampaignReportRow, "clientId">>
  ) {
    setSaved(false);
    const rowIndex = currentPage * ROWS_PER_PAGE + visibleIndex;
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setSaved(false);
    setRows((current) => [...current, blankRow()]);
    setPage(Math.floor(rows.length / ROWS_PER_PAGE));
  }

  function removeRow(visibleIndex: number) {
    setSaved(false);
    const rowIndex = currentPage * ROWS_PER_PAGE + visibleIndex;
    setRows((current) => current.filter((_, index) => index !== rowIndex));
  }

  async function saveRows() {
    if (!from || !to) return;

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch(apiPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: businessKey,
          periodStart: from,
          periodEnd: to,
          rows: toInputRows(rows),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ApiCampaignReportRow[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Unable to save campaign rows.");
      }

      setRows(Array.isArray(json.rows) ? json.rows.map(normalizeApiRow) : []);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save campaign rows.");
    } finally {
      setSaving(false);
    }
  }

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
          <button
            type="button"
            onClick={addRow}
            className="grid h-10 w-10 place-items-center rounded-lg border border-transparent text-lg font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
            aria-label="Add Facebook campaign row"
            title="Add row"
          >
            +
          </button>
          <button
            type="button"
            onClick={saveRows}
            disabled={saving || importing || !loaded || !from || !to}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
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
          {error || "Campaign report saved."}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[1720px] w-full table-fixed border-collapse text-sm">
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
              <th className="w-[64px] px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {!loaded ? (
              <tr>
                <td colSpan={16} className="px-4 py-12 text-center text-sm text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-12 text-center text-sm text-gray-400">
                  No campaign rows for this period.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, index) => {
                const label = row.campaign || row.campaignId || `row ${index + 1}`;

                return (
                  <tr key={row.clientId} className="transition-colors hover:bg-gray-50">
                    <td className="px-2 py-1 align-middle">
                      <input
                        value={row.campaignId}
                        onChange={(event) =>
                          updateRow(index, { campaignId: event.target.value })
                        }
                        className={inputClass("text-left tabular-nums")}
                        aria-label={`Campaign id for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <input
                        value={row.campaign}
                        onChange={(event) => updateRow(index, { campaign: event.target.value })}
                        className={inputClass("text-left")}
                        aria-label={`Campaign name for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <input
                        value={row.status}
                        onChange={(event) => updateRow(index, { status: event.target.value })}
                        className={inputClass("text-left")}
                        aria-label={`Campaign status for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <IntegerInput
                        value={row.clicks}
                        onChange={(value) => updateRow(index, { clicks: value })}
                        ariaLabel={`Clicks for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MoneyInput
                        value={row.costCents}
                        onChange={(value) => updateRow(index, { costCents: value })}
                        ariaLabel={`Cost for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MoneyInput
                        value={row.revenueCents}
                        onChange={(value) => updateRow(index, { revenueCents: value })}
                        ariaLabel={`Revenue for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <PercentInput
                        value={row.roiPercent}
                        onChange={(value) => updateRow(index, { roiPercent: value })}
                        ariaLabel={`ROI percent for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MoneyInput
                        value={row.cpcCents}
                        onChange={(value) => updateRow(index, { cpcCents: value })}
                        ariaLabel={`CPC for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <PercentInput
                        value={row.ctrPercent}
                        onChange={(value) => updateRow(index, { ctrPercent: value })}
                        ariaLabel={`CTR for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <IntegerInput
                        value={row.sales}
                        onChange={(value) => updateRow(index, { sales: value })}
                        ariaLabel={`Sales for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MoneyInput
                        value={row.cpsCents}
                        onChange={(value) => updateRow(index, { cpsCents: value })}
                        ariaLabel={`CPS for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <IntegerInput
                        value={row.leads}
                        onChange={(value) => updateRow(index, { leads: value })}
                        ariaLabel={`Leads for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MoneyInput
                        value={row.cplCents}
                        onChange={(value) => updateRow(index, { cplCents: value })}
                        ariaLabel={`CPL for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <IntegerInput
                        value={row.impressions}
                        onChange={(value) => updateRow(index, { impressions: value })}
                        ariaLabel={`Impressions for ${label}`}
                      />
                    </td>
                    <td className="px-2 py-1 align-middle">
                      <MoneyInput
                        value={row.averageRevenueCents}
                        onChange={(value) =>
                          updateRow(index, { averageRevenueCents: value })
                        }
                        ariaLabel={`Average revenue for ${label}`}
                      />
                    </td>
                    <td className="px-4 py-1 align-middle">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="grid h-8 w-8 place-items-center rounded-md text-sm font-semibold text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-100"
                        aria-label={`Remove ${label}`}
                        title="Remove row"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
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
