export type MarketingSourceKey = "meta" | "google-ads" | "google-lsa";

export const ATTRIBUTION_PERIOD = {
  from: "2026-01-01",
  to: "2026-09-05",
  label: "January 1 – September 5, 2026",
} as const;

export const ATTRIBUTION_SPEND_CENTS: Record<MarketingSourceKey, number> = {
  meta: 2_605_891,
  "google-ads": 556_467,
  "google-lsa": 2_315_313,
};

// Completed MoeGo service revenue from retained 2026 leads, assigned by the
// service sale date. Website revenue is allocated 70% to Google Ads and 30%
// to Meta; Website Getting Started Form is Google Ads. Pre-2026 clients are
// excluded before attribution.
export const ATTRIBUTED_REVENUE_BY_MONTH_CENTS: Record<
  string,
  Record<MarketingSourceKey, number>
> = {
  "2026-01": { meta: 68_000, "google-ads": 16_500, "google-lsa": 373_200 },
  "2026-02": { meta: 189_490, "google-ads": 73_110, "google-lsa": 488_300 },
  "2026-03": { meta: 372_130, "google-ads": 238_270, "google-lsa": 735_200 },
  "2026-04": { meta: 294_250, "google-ads": 320_860, "google-lsa": 1_026_500 },
  "2026-05": { meta: 391_020, "google-ads": 373_080, "google-lsa": 584_100 },
  "2026-06": { meta: 559_560, "google-ads": 998_840, "google-lsa": 1_154_400 },
  "2026-07": { meta: 456_019, "google-ads": 1_106_581, "google-lsa": 902_600 },
  "2026-08": { meta: 617_270, "google-ads": 842_530, "google-lsa": 656_450 },
  "2026-09": { meta: 68_320, "google-ads": 84_480, "google-lsa": 192_800 },
};

export function getAttributedRevenueCents(from: Date, toInclusive: Date) {
  const totals: Record<MarketingSourceKey, number> = {
    meta: 0,
    "google-ads": 0,
    "google-lsa": 0,
  };

  for (const [month, values] of Object.entries(ATTRIBUTED_REVENUE_BY_MONTH_CENTS)) {
    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    if (monthStart <= toInclusive && nextMonth > from) {
      for (const source of Object.keys(totals) as MarketingSourceKey[]) {
        totals[source] += values[source];
      }
    }
  }

  return totals;
}

export function isAttributionPeriod(from: Date, toInclusive: Date) {
  return (
    from.toISOString().slice(0, 10) === ATTRIBUTION_PERIOD.from &&
    toInclusive.toISOString().slice(0, 10) === ATTRIBUTION_PERIOD.to
  );
}
