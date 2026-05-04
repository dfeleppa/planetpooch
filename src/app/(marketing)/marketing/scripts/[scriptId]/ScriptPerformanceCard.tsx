import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatCents,
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
  adCount: number;
} | null;

/**
 * Server component — uses the slug + linked-insight totals to render a
 * compact performance row on the script detail page. If no insights have
 * landed yet, surfaces the slug-setup hint instead.
 */
export function ScriptPerformanceCard({
  metaAdSlug,
  performance,
}: {
  scriptId: string;
  metaAdSlug: string | null;
  performance: Performance;
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
      <CardContent className="pt-0">
        {!metaAdSlug ? (
          <p className="text-sm text-gray-500">
            Set a Meta ad slug below, then include it in the ad name in
            Ads Manager. Insights will auto-link on the next sync.
          </p>
        ) : !performance ? (
          <p className="text-sm text-gray-500">
            No insights yet for ads containing <code>{metaAdSlug}</code>.
            Either no ad with that slug is live, or the next sync hasn&apos;t
            run yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Spend" value={formatCents(performance.spendCents)} />
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
            <Stat label="Purchases" value={performance.purchases.toString()} />
            <Stat
              label="ROAS"
              value={formatRoas(
                performance.purchaseValueCents,
                performance.spendCents
              )}
            />
            <Stat label="Ads" value={performance.adCount.toString()} />
          </div>
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
