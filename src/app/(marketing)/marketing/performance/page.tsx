import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  formatCents,
  formatHookRate,
  formatHoldRate,
  formatRoas,
  getAdAggregates,
} from "@/lib/marketing/performance";
import { PerformanceActions } from "./PerformanceActions";

export default async function PerformancePage() {
  await requireMarketing();
  const ads = await getAdAggregates(30);

  const totals = ads.reduce(
    (acc, a) => {
      acc.spendCents += a.spendCents;
      acc.impressions += a.impressions;
      acc.purchases += a.purchases;
      acc.purchaseValueCents += a.purchaseValueCents;
      return acc;
    },
    { spendCents: 0, impressions: 0, purchases: 0, purchaseValueCents: 0 }
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Performance</h1>
          <p className="text-gray-500 mt-1">
            Last 30 days from Meta Ads. Re-syncs nightly; refresh to pull
            fresh numbers immediately.
          </p>
        </div>
        <PerformanceActions />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {formatCents(totals.spendCents)}
            </p>
            <p className="text-sm text-gray-500">Spend (30d)</p>
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
          </h2>
        </CardHeader>
        <CardContent className="pt-0">
          {ads.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No insights yet. Click <strong>Refresh now</strong> above
              once your Meta credentials are configured.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-2 py-2 font-medium">Ad</th>
                    <th className="px-2 py-2 font-medium text-right">Spend</th>
                    <th className="px-2 py-2 font-medium text-right">Impr.</th>
                    <th className="px-2 py-2 font-medium text-right">
                      Hook rate
                    </th>
                    <th className="px-2 py-2 font-medium text-right">
                      Hold rate
                    </th>
                    <th className="px-2 py-2 font-medium text-right">CTR</th>
                    <th className="px-2 py-2 font-medium text-right">
                      Purchases
                    </th>
                    <th className="px-2 py-2 font-medium text-right">ROAS</th>
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
                            {a.scriptId ? (
                              <Link
                                href={`/marketing/scripts/${a.scriptId}`}
                                className="text-xs"
                              >
                                <Badge variant="info">
                                  ↪ {a.scriptIdeaTitle ?? "script"}
                                </Badge>
                              </Link>
                            ) : (
                              <Badge variant="default">unlinked</Badge>
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
