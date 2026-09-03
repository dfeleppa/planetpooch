---
name: weekly-kpi-report
description: Build Planet Pooch Sunday-Saturday KPI reports and source the headline weekly net-sales totals for both business segments from MoeGo's browser-visible Sales Summary report. Use when Daniel asks to create, refresh, verify, or reconcile a weekly KPI report.
---

# Weekly KPI Report

## Headline revenue

Pull the two headline revenue numbers through the logged-in MoeGo browser session. Do not calculate these headline totals from the MoeGo OpenAPI order feed.

Use `https://go.moego.pet/report/insights/reports?diagramId=reports_sales_summary&active=1&%7Ec=9219&%7Eb=119538` and verify that the page is the **Sales summary report** and says **Based on sale date**.

For the report's Sunday-Saturday week:

1. Set the date range to the requested Sunday through Saturday, inclusive.
2. Select **Planet Pooch** in the Business filter and record the **Total net sales** value from the Total row.
3. Select **Planet Pooch Pet Resort** and record the corresponding **Total net sales** value.
4. Re-check the selected business and visible date inputs before accepting each total. If daily rows are visible, sum their net-sales values and require the sum to equal the Total row to the cent.

Label the values exactly:

- Planet Pooch net sales
- Planet Pooch Pet Resort net sales

Place both values together at the top of the weekly KPI report, before segment-specific KPI sections. State the inclusive date range beside the heading so the reporting boundary is unambiguous.

After verifying both totals, upsert them into the Planet Pooch Supabase project in
`FinanceWeeklyKpiHeadline`, keyed by the Sunday `weekStart`. Store money as integer cents in:

- `mobileNetSalesCents` for Planet Pooch
- `resortNetSalesCents` for Planet Pooch Pet Resort

The KPI page reads this record for the two headline revenue cards. It matches Pet Resort payroll
rows whose `payPeriod` is the same Sunday-Saturday range, sums all matching payroll runs, and shows
payroll divided by Resort net sales as a percentage. If there is no matching payroll run, leave the
payroll amount and percentage unresolved rather than substituting another pay period.

## Reconciliation rules

- Treat MoeGo's browser-visible **Total net sales** as authoritative for these two headline values. Net sales is distinct from Total collected, Total expected, and Total gross sales.
- Keep each business separate; never use **All businesses** for a segment headline.
- Do not substitute a client-list Total paid view or a payment report.
- Do not expose client names, phone numbers, invoice details, or other row-level information in the KPI report.
- If the report has not finished refreshing after a filter change, wait for the loading state to clear and verify the selected business again.
- If the browser session is logged out or the Sales Summary report cannot be verified, leave the headline values unresolved and report the blocker. Do not silently fall back to the API-derived estimate.

## Remaining KPIs

Continue using the existing KPI sources and segment rules for all non-headline metrics. This skill changes the source of the two top-level business net-sales totals only; it does not redefine revenue inside narrower service KPIs such as daycare, boarding, training, or grooming.
