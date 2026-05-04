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
  getCampaigns,
  getLinkableScripts,
  SORTABLE_COLUMNS,
  type SortColumn,
  type SortDir,
} from "@/lib/marketing/performance";
import { AdLinkPicker } from "./AdLinkPicker";
import { PerformanceActions } from "./PerformanceActions";
import { PerformanceFilters } from "./PerformanceFilters";
import { PerformanceTabs } from "./PerformanceTabs";

type SearchParams = {
  days?: string;
  campaign?: string;
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

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireMarketing();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const campaign = sp.campaign?.trim() ?? "";
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);

  const [ads, campaigns, scripts] = await Promise.all([
    getAdAggregates({ days, campaign, sort, dir }),
    getCampaigns(days),
    getLinkableScripts(),
  ]);

  const totals = ads.reduce(
    (acc, a) => {
      acc.spendCents += a.spendCents;
      acc.impressions += a.impressions;
      acc.purchases += a.purchases;
      acc.purchaseValueCents += a.purchaseValueCents;
      acc.leads += a.leads;
      return acc;
    },
    {
      spendCents: 0,
      impressions: 0,
      purchases: 0,
      purchaseValueCents: 0,
      leads: 0,
    }
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Performance</h1>
          <p className="text-gray-500 mt-1">
            Last {days} days from Meta Ads. Re-syncs nightly; refresh to pull
            fresh numbers immediately.
          </p>
        </div>
        <PerformanceActions />
      </div>

      <PerformanceTabs active="ads" />

      <PerformanceFilters
        days={days}
        campaign={campaign}
        campaigns={campaigns}
      />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {formatCents(totals.spendCents)}
            </p>
            <p className="text-sm text-gray-500">Spend ({days}d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {totals.impressions.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">Impressions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {totals.leads.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {formatCpl(totals.spendCents, totals.leads)}
            </p>
            <p className="text-sm text-gray-500">CPL</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {totals.purchases.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">Purchases</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {formatRoas(totals.purchaseValueCents, totals.spendCents)}
            </p>
            <p className="text-sm text-gray-500">ROAS</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">
            Ads ({ads.length})
            {campaign && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                in {campaign}
              </span>
            )}
          </h2>
        </CardHeader>
        <CardContent className="pt-0">
          {ads.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {campaign
                ? "No ads in this campaign for the selected window."
                : "No insights yet. Click Refresh now above once your Meta credentials are configured."}
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
                      Hook rate
                    </SortableTh>
                    <SortableTh col="holdRate" sort={sort} dir={dir} sp={sp}>
                      Hold rate
                    </SortableTh>
                    <SortableTh col="ctr" sort={sort} dir={dir} sp={sp}>
                      CTR
                    </SortableTh>
                    <SortableTh col="leads" sort={sort} dir={dir} sp={sp}>
                      Leads
                    </SortableTh>
                    <SortableTh col="cpl" sort={sort} dir={dir} sp={sp}>
                      CPL
                    </SortableTh>
                    <SortableTh col="purchases" sort={sort} dir={dir} sp={sp}>
                      Purchases
                    </SortableTh>
                    <SortableTh col="roas" sort={sort} dir={dir} sp={sp}>
                      ROAS
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a) => {
                    const ctr =
                      a.impressions > 0
                        ? `${((a.linkClicks / a.impressions) * 100).toFixed(2)}%`
                        : "—";
                    return (
                      <tr
                        key={a.adId}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-2 py-3 max-w-[280px]">
                          <div className="font-medium text-gray-900 truncate">
                            {a.adName}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {a.campaignName && (
                              <span className="text-xs text-gray-500 truncate">
                                {a.campaignName}
                              </span>
                            )}
                            <AdLinkPicker
                              adId={a.adId}
                              adName={a.adName}
                              currentScriptId={a.scriptId}
                              currentScriptIdeaTitle={a.scriptIdeaTitle}
                              scripts={scripts}
                            />
                            {a.scriptId && (
                              <Link
                                href={`/marketing/scripts/${a.scriptId}`}
                                className="text-xs text-blue-600 hover:underline"
                                aria-label="Open linked script"
                              >
                                open →
                              </Link>
                            )}
                          </div>
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
                          {ctr}
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
                      </tr>
                    );
                  })}
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
  // Clicking the active column flips direction. Clicking a new column
  // defaults to desc — "biggest first" is what marketers want for every
  // metric we expose here.
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams();
  if (sp.days) params.set("days", sp.days);
  if (sp.campaign) params.set("campaign", sp.campaign);
  params.set("sort", col);
  // "desc" is the default, so we only include dir when it deviates.
  if (nextDir !== "desc") params.set("dir", nextDir);
  const arrow = active ? (dir === "desc" ? "↓" : "↑") : "";
  return (
    <th className="px-2 py-2 font-medium text-right">
      <Link
        href={`/marketing/performance?${params.toString()}`}
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
