import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DAY_PRESETS,
  formatCents,
  formatCpl,
  formatHookRate,
  formatHoldRate,
  formatRoas,
  getAdAggregates,
  getLinkableScripts,
  getTotalSpendCents,
  SORTABLE_COLUMNS,
  type SortColumn,
  type SortDir,
} from "@/lib/marketing/performance";
import { AdLinkPicker } from "../AdLinkPicker";
import { PerformanceTabs } from "../PerformanceTabs";

type SearchParams = {
  days?: string;
  sort?: string;
  dir?: string;
};

function parseDays(raw: string | undefined): number {
  const n = raw ? Number(raw) : 30;
  return (DAY_PRESETS as readonly number[]).includes(n) ? n : 30;
}

function parseSort(raw: string | undefined): SortColumn {
  return (SORTABLE_COLUMNS as readonly string[]).includes(raw ?? "")
    ? (raw as SortColumn)
    : "spend";
}

function parseDir(raw: string | undefined): SortDir {
  return raw === "asc" ? "asc" : "desc";
}

export default async function UnlinkedAdsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireMarketing();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);

  const [ads, scripts, totalSpendCents] = await Promise.all([
    getAdAggregates({ days, sort, dir, linked: "unlinked" }),
    getLinkableScripts(),
    getTotalSpendCents(days),
  ]);

  const unlinkedSpendCents = ads.reduce((sum, a) => sum + a.spendCents, 0);
  const unlinkedLeads = ads.reduce((sum, a) => sum + a.leads, 0);
  const unlinkedSharePct =
    totalSpendCents > 0
      ? ((unlinkedSpendCents / totalSpendCents) * 100).toFixed(1)
      : "—";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unlinked Ads</h1>
          <p className="text-gray-500 mt-1">
            Ads with no Script attribution. Highest spend first — fix these
            first to recover the most data.
          </p>
        </div>
      </div>

      <PerformanceTabs active="unlinked" />

      <div
        className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 mb-4"
        role="group"
        aria-label="Date range"
      >
        {DAY_PRESETS.map((d) => {
          const params = new URLSearchParams();
          if (d !== 30) params.set("days", String(d));
          if (sort !== "spend") params.set("sort", sort);
          if (dir !== "desc") params.set("dir", dir);
          const qs = params.toString();
          const href = qs
            ? `/marketing/performance/unlinked?${qs}`
            : "/marketing/performance/unlinked";
          return (
            <Link
              key={d}
              href={href}
              aria-current={d === days ? "true" : undefined}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                d === days
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {d}d
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{ads.length}</p>
            <p className="text-sm text-gray-500">Unlinked ads ({days}d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {formatCents(unlinkedSpendCents)}
            </p>
            <p className="text-sm text-gray-500">Unattributed spend</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {unlinkedLeads.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">Unattributed leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {unlinkedSharePct === "—" ? "—" : `${unlinkedSharePct}%`}
            </p>
            <p className="text-sm text-gray-500">% of total spend</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">
            Triage queue ({ads.length})
          </h2>
        </CardHeader>
        <CardContent className="pt-0">
          {ads.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nothing to triage — every ad with spend in the last {days} days
              is linked to a Script. ✓
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-2 py-2 font-medium">Ad</th>
                    <SortableTh col="spend" sort={sort} dir={dir} sp={sp}>
                      Spend
                    </SortableTh>
                    <SortableTh col="impressions" sort={sort} dir={dir} sp={sp}>
                      Impr.
                    </SortableTh>
                    <SortableTh col="hookRate" sort={sort} dir={dir} sp={sp}>
                      Hook
                    </SortableTh>
                    <SortableTh col="holdRate" sort={sort} dir={dir} sp={sp}>
                      Hold
                    </SortableTh>
                    <SortableTh col="leads" sort={sort} dir={dir} sp={sp}>
                      Leads
                    </SortableTh>
                    <SortableTh col="cpl" sort={sort} dir={dir} sp={sp}>
                      CPL
                    </SortableTh>
                    <SortableTh col="purchases" sort={sort} dir={dir} sp={sp}>
                      Purch.
                    </SortableTh>
                    <SortableTh col="roas" sort={sort} dir={dir} sp={sp}>
                      ROAS
                    </SortableTh>
                    <th className="px-2 py-2 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a) => (
                    <tr
                      key={a.adId}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-2 py-3 max-w-[280px]">
                        <div
                          className="font-medium text-gray-900 truncate"
                          title={a.adName}
                        >
                          {a.adName}
                        </div>
                        {a.campaignName && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">
                            {a.campaignName}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatCents(a.spendCents)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {a.impressions.toLocaleString()}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatHookRate(a.videoPlays3s, a.impressions)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatHoldRate(a.videoThruplays, a.videoPlays3s)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {a.leads}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatCpl(a.spendCents, a.leads)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {a.purchases}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">
                        {formatRoas(a.purchaseValueCents, a.spendCents)}
                      </td>
                      <td className="px-2 py-3">
                        <AdLinkPicker
                          adId={a.adId}
                          adName={a.adName}
                          currentScriptId={a.scriptId}
                          currentScriptIdeaTitle={a.scriptIdeaTitle}
                          scripts={scripts}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortableTh({
  col,
  sort,
  dir,
  sp,
  children,
}: {
  col: SortColumn;
  sort: SortColumn;
  dir: SortDir;
  sp: SearchParams;
  children: React.ReactNode;
}) {
  const active = sort === col;
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams();
  if (sp.days) params.set("days", sp.days);
  params.set("sort", col);
  if (nextDir !== "desc") params.set("dir", nextDir);
  const arrow = active ? (dir === "desc" ? "↓" : "↑") : "";
  return (
    <th className="px-2 py-2 font-medium text-right">
      <Link
        href={`/marketing/performance/unlinked?${params.toString()}`}
        scroll={false}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${
          active ? "text-gray-900" : ""
        }`}
      >
        {children}
        {arrow && <span aria-hidden>{arrow}</span>}
      </Link>
    </th>
  );
}
