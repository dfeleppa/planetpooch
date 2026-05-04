import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatCents,
  formatCpl,
  formatHookRate,
  formatHoldRate,
  formatRoas,
} from "@/lib/marketing/performance";

type Performance = {
  spendCents: number;
  impressions: number;
  linkClicks: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
  leads: number;
  adCount: number;
} | null;

type ContributingAd = {
  adId: string;
  adName: string;
  spendCents: number;
  impressions: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
  leads: number;
};

/**
 * Server component — last-30-day totals for the linked insights, plus a
 * per-ad breakdown so a marketer can see which ads are pulling the
 * average up or down.
 */
export function ScriptPerformanceCard({
  metaAdSlug,
  performance,
  ads,
}: {
  scriptId: string;
  metaAdSlug: string | null;
  performance: Performance;
  ads: ContributingAd[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">
            Performance — last 30 days
          </h2>
          {metaAdSlug ? (
            <code className="text-xs text-gray-500">slug: {metaAdSlug}</code>
          ) : (
            <span className="text-xs text-gray-500">no slug set</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {!performance ? (
          <p className="text-sm text-gray-500">
            No insights yet for this script. Either set a Meta ad slug below
            and include it in the ad name in Ads Manager (auto-link on next
            sync), or link an ad manually from the{" "}
            <a
              href="/marketing/performance"
              className="text-blue-600 hover:underline"
            >
              Performance
            </a>{" "}
            page.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat label="Spend" value={formatCents(performance.spendCents)} />
              <Stat
                label="Leads"
                value={performance.leads.toLocaleString()}
              />
              <Stat
                label="CPL"
                value={formatCpl(performance.spendCents, performance.leads)}
              />
              <Stat
                label="Purchases"
                value={performance.purchases.toString()}
              />
              <Stat
                label="ROAS"
                value={formatRoas(
                  performance.purchaseValueCents,
                  performance.spendCents
                )}
              />
              <Stat
                label="Impressions"
                value={performance.impressions.toLocaleString()}
              />
              <Stat
                label="Hook rate"
                value={formatHookRate(
                  performance.videoPlays3s,
                  performance.impressions
                )}
              />
              <Stat
                label="Hold rate"
                value={formatHoldRate(
                  performance.videoThruplays,
                  performance.videoPlays3s
                )}
              />
              <Stat
                label="Link clicks"
                value={performance.linkClicks.toLocaleString()}
              />
              <Stat label="Ads" value={performance.adCount.toString()} />
            </div>

            {ads.length > 0 && (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="px-2 py-2 font-medium">Contributing ads</th>
                      <th className="px-2 py-2 font-medium text-right">
                        Spend
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        Impr.
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        Hook
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        Hold
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        Leads
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        CPL
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        Purch.
                      </th>
                      <th className="px-2 py-2 font-medium text-right">
                        ROAS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.map((a) => (
                      <tr
                        key={a.adId}
                        className="border-b border-gray-100 last:border-b-0"
                      >
                        <td
                          className="px-2 py-2 max-w-[280px] truncate text-gray-900"
                          title={a.adName}
                        >
                          {a.adName}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatCents(a.spendCents)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {a.impressions.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatHookRate(a.videoPlays3s, a.impressions)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatHoldRate(a.videoThruplays, a.videoPlays3s)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {a.leads}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatCpl(a.spendCents, a.leads)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {a.purchases}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatRoas(a.purchaseValueCents, a.spendCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 tabular-nums">
        {value}
      </p>
    </div>
  );
}
