import { reportScope, matchesService } from "@/lib/marketing/report-scope";
import { reportingRange } from "../ad-reporting/report-range";
import { getMetaPeriodMetrics } from "@/lib/marketing/meta-reporting";
import { CampaignSyncControls } from "../ad-reporting/CampaignSyncControls";
import { getCampaignBusinessAssignments } from "@/lib/marketing/campaign-business";
import { CampaignBusinessAssignments } from "./CampaignBusinessAssignments";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  SORTABLE_COLUMNS,
  formatCents,
  formatCpl,
  formatHoldRate,
  formatHookRate,
  formatRoas,
  getAdAggregates,
  type SortColumn,
  type SortDir,
} from "@/lib/marketing/performance";
import { PerformanceFilters } from "../performance/PerformanceFilters";

type Query = {
  business?: string; service?: string; source?: string; compare?: string; compareFrom?: string; compareTo?: string;
  days?: string;
  from?: string;
  to?: string;
  campaign?: string;
  sort?: string;
  dir?: string;
};

function parseSort(value: string | undefined): SortColumn {
  return (SORTABLE_COLUMNS as readonly string[]).includes(value ?? "") ? value as SortColumn : "spend";
}

export async function MetaCreativePerformance({ searchParams }: { searchParams: Query }) {
  const range = reportingRange(searchParams);
  const { from, to } = range;
  const days = range.days ?? 30;
  const scope = reportScope(searchParams);
  const campaign = searchParams.campaign?.trim() ?? "";
  const sort = parseSort(searchParams.sort);
  const dir: SortDir = searchParams.dir === "asc" ? "asc" : "desc";

  const [allAds, assignments, coverage] = await Promise.all([
    getAdAggregates({ days, from, to, business: scope.business, sort, dir }),
    getCampaignBusinessAssignments(),
    getMetaPeriodMetrics(scope.business, new Date(from + "T00:00:00Z"), new Date(Date.parse(to + "T00:00:00Z") + 86400000)),
  ]);
  const serviceAds = allAds.filter((ad) => matchesService([ad.adName, ad.campaignName ?? ""], scope.service));
  const campaigns = [...new Set(serviceAds.map((ad) => ad.campaignName).filter((name): name is string => Boolean(name)))].sort();
  const ads = serviceAds.filter((ad) => !campaign || ad.campaignName === campaign);
  const totals = ads.reduce((acc, ad) => ({
    spend: acc.spend + ad.spendCents,
    impressions: acc.impressions + ad.impressions,
    leads: acc.leads + ad.leads,
    purchases: acc.purchases + ad.purchases,
    revenue: acc.revenue + ad.purchaseValueCents,
  }), { spend: 0, impressions: 0, leads: 0, purchases: 0, revenue: 0 });

  const best = [...ads].filter((ad) => ad.leads >= 3).sort((a, b) => (a.spendCents / a.leads) - (b.spendCents / b.leads))[0];
  const needsAttention = [...ads].filter((ad) => ad.leads === 0 && ad.spendCents > 0).sort((a, b) => b.spendCents - a.spendCents)[0];

  return (
    <div>
      <CampaignBusinessAssignments campaigns={assignments} />
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <PerformanceFilters hideDates days={days} from={from} to={to} campaign={campaign} campaigns={campaigns} />
        <CampaignSyncControls metaOnly from={from} to={to} isAdmin={false} metaSyncedAt={coverage.syncedAt?.toISOString() ?? null} googleSyncedAt={null} moegoSyncedAt={null} />
      </div>

      <p className="mb-4 text-xs text-gray-600">Meta platform-reported metrics · {from} to {to}. {scope.business === "all" ? "All businesses, including unassigned campaigns." : "Campaign business assignments; shared campaigns may appear in both businesses."}</p>
      {scope.service !== "all" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Creative service filtering matches ad or campaign names. It does not allocate campaign costs to requested services or prove lead service intent. Unnamed services are excluded.</p>}
      {!coverage.complete && <p className="mb-4 text-sm text-amber-800">Meta data does not cover the full selected period. Refresh data before comparing totals.</p>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label={from && to ? `Spend · ${from} to ${to}` : `Spend · ${days}d`} value={formatCents(totals.spend)} />
        <Metric label="Meta-reported leads" value={totals.leads.toLocaleString()} />
        <Metric label="CPL" value={formatCpl(totals.spend, totals.leads)} />
        <Metric label="Purchases" value={totals.purchases.toLocaleString()} />
        <Metric label="ROAS" value={formatRoas(totals.revenue, totals.spend)} />
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        <DecisionCard eyebrow="Low reported CPL" title={best?.adName ?? "No eligible creative yet"} detail={best ? `${best.leads} platform-reported leads · ${formatCpl(best.spendCents, best.leads)} CPL` : "A creative appears here after at least 3 reported leads."} tone="good" />
        <DecisionCard eyebrow="Check attribution" title={needsAttention?.adName ?? "No spend without reported leads"} detail={needsAttention ? `${formatCents(needsAttention.spendCents)} spent with no platform-reported leads; verify MoeGo inquiries before changing the ad.` : "All spending creatives have platform-reported results."} tone="warn" />
      </div>
      <p className="mb-4 text-xs text-gray-500">Platform-reported leads may not match MoeGo inquiries or bookings. Check MoeGo outcomes in Campaign results before changing budgets.</p>

      <Card>
        <CardHeader><h3 className="text-base font-semibold text-gray-900">Meta creatives ({ads.length})</h3></CardHeader>
        <CardContent className="pt-0">
          {ads.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No creatives match this view.</p> : (
            <div className="-mx-2 overflow-x-auto sm:mx-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-2 py-2 font-medium">Creative</th>
                  <SortHeader label="Spend" column="spend" sort={sort} dir={dir} query={searchParams} />
                  <SortHeader label="Hook" column="hookRate" sort={sort} dir={dir} query={searchParams} />
                  <SortHeader label="Hold" column="holdRate" sort={sort} dir={dir} query={searchParams} />
                  <SortHeader label="CTR" column="ctr" sort={sort} dir={dir} query={searchParams} />
                  <SortHeader label="Leads" column="leads" sort={sort} dir={dir} query={searchParams} />
                  <SortHeader label="CPL" column="cpl" sort={sort} dir={dir} query={searchParams} />
                  <SortHeader label="ROAS" column="roas" sort={sort} dir={dir} query={searchParams} />
                </tr></thead>
                <tbody>{ads.map((ad) => (
                  <tr key={ad.adId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="max-w-[320px] px-2 py-3">
                      <p className="truncate font-medium text-gray-900">{ad.adName}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        {ad.campaignName && <span className="truncate">{ad.campaignName}</span>}
                      </div>
                    </td>
                    <NumberCell>{formatCents(ad.spendCents)}</NumberCell>
                    <NumberCell>{formatHookRate(ad.videoPlays3s, ad.impressions)}</NumberCell>
                    <NumberCell>{formatHoldRate(ad.videoThruplays, ad.videoPlays3s)}</NumberCell>
                    <NumberCell>{ad.impressions > 0 ? `${((ad.linkClicks / ad.impressions) * 100).toFixed(2)}%` : "—"}</NumberCell>
                    <NumberCell>{ad.leads}</NumberCell>
                    <NumberCell>{formatCpl(ad.spendCents, ad.leads)}</NumberCell>
                    <NumberCell>{formatRoas(ad.purchaseValueCents, ad.spendCents)}</NumberCell>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="py-4"><p className="text-2xl font-semibold tabular-nums text-gray-900">{value}</p><p className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</p></CardContent></Card>;
}

function DecisionCard({ eyebrow, title, detail, tone }: { eyebrow: string; title: string; detail: string; tone: "good" | "warn" | "neutral" }) {
  const colors = tone === "good" ? "border-green-200 bg-green-50/60" : tone === "warn" ? "border-amber-200 bg-amber-50/60" : "border-gray-200 bg-white";
  return <div className={`rounded-xl border p-4 ${colors}`}><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{eyebrow}</p><p className="mt-1 truncate text-sm font-semibold text-gray-900">{title}</p><p className="mt-1 text-xs text-gray-600">{detail}</p></div>;
}

function NumberCell({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-3 text-right tabular-nums text-gray-700">{children}</td>;
}

function SortHeader({ label, column, sort, dir, query }: { label: string; column: SortColumn; sort: SortColumn; dir: SortDir; query: Query }) {
  const params = new URLSearchParams({ view: "creatives" });
  for (const key of ["business", "service", "source", "compare", "compareFrom", "compareTo"] as const) if (query[key]) params.set(key, query[key]!);
  if (query.days) params.set("days", query.days);
  if (query.from && query.to) { params.set("from", query.from); params.set("to", query.to); }
  if (query.campaign) params.set("campaign", query.campaign);
  params.set("sort", column);
  const nextDirection = sort === column && dir === "desc" ? "asc" : "desc";
  if (nextDirection === "asc") params.set("dir", "asc");
  const arrow = sort === column ? (dir === "desc" ? "↓" : "↑") : "";
  return <th className="px-2 py-2 text-right font-medium"><Link href={`/marketing?${params}`} scroll={false} className="hover:text-gray-900">{label} {arrow}</Link></th>;
}
