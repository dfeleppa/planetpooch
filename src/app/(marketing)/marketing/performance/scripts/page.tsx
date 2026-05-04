import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DAY_PRESETS,
  formatCents,
  formatCpl,
  formatHookRate,
  formatHoldRate,
  formatRoas,
  getScriptLeaderboard,
  SORTABLE_COLUMNS,
  type SortColumn,
  type SortDir,
} from "@/lib/marketing/performance";
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

export default async function ScriptLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireMarketing();
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir);

  const scripts = await getScriptLeaderboard({ days, sort, dir });

  const totals = scripts.reduce(
    (acc, s) => {
      acc.spendCents += s.spendCents;
      acc.purchases += s.purchases;
      acc.purchaseValueCents += s.purchaseValueCents;
      acc.leads += s.leads;
      return acc;
    },
    { spendCents: 0, purchases: 0, purchaseValueCents: 0, leads: 0 }
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Script Performance
          </h1>
          <p className="text-gray-500 mt-1">
            Ad performance grouped by linked Script. Last {days} days.
          </p>
        </div>
      </div>

      <PerformanceTabs active="scripts" />

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
            ? `/marketing/performance/scripts?${qs}`
            : "/marketing/performance/scripts";
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

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{scripts.length}</p>
            <p className="text-sm text-gray-500">Scripts</p>
          </CardContent>
        </Card>
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
            Scripts ({scripts.length})
          </h2>
        </CardHeader>
        <CardContent className="pt-0">
          {scripts.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No scripts have linked ad activity in the last {days} days. Link
              ads to scripts from the{" "}
              <Link
                href="/marketing/performance"
                className="text-blue-600 hover:underline"
              >
                Ads view
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-2 py-2 font-medium">Script</th>
                    <th className="px-2 py-2 font-medium text-right">Ads</th>
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
                  {scripts.map((s) => {
                    const ctr =
                      s.impressions > 0
                        ? `${((s.linkClicks / s.impressions) * 100).toFixed(2)}%`
                        : "—";
                    return (
                      <tr
                        key={s.scriptId}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-2 py-3 max-w-[280px]">
                          <Link
                            href={`/marketing/scripts/${s.scriptId}`}
                            className="font-medium text-gray-900 hover:text-blue-600 truncate block"
                          >
                            {s.ideaTitle}
                          </Link>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="default">{s.platform}</Badge>
                            <Badge variant="default">{s.status}</Badge>
                            {s.metaAdSlug && (
                              <span className="text-xs text-gray-500 font-mono truncate">
                                {s.metaAdSlug}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {s.adCount}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {formatCents(s.spendCents)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {s.impressions.toLocaleString()}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {formatHookRate(s.videoPlays3s, s.impressions)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {formatHoldRate(s.videoThruplays, s.videoPlays3s)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {ctr}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {s.leads}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {formatCpl(s.spendCents, s.leads)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {s.purchases}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {formatRoas(s.purchaseValueCents, s.spendCents)}
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
  const nextDir: SortDir = active && dir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams();
  if (sp.days) params.set("days", sp.days);
  params.set("sort", col);
  if (nextDir !== "desc") params.set("dir", nextDir);
  const arrow = active ? (dir === "desc" ? "↓" : "↑") : "";
  return (
    <th className="px-2 py-2 font-medium text-right">
      <Link
        href={`/marketing/performance/scripts?${params.toString()}`}
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
