---
name: weekly-kpi-report
description: Build Planet Pooch Sunday-Saturday KPI reports using the established net-sales source for each business. Use when Daniel asks to create, refresh, verify, or reconcile a weekly KPI report.
---

# Weekly KPI Report

## Pet Resort net sales

Use the app's synced MoeGo order data for **Planet Pooch Pet Resort** (`biz3pcO`). The KPI page calculates net sales automatically for the selected Sunday-Saturday week as:

- `subtotal - discount` for each order;
- only `COMPLETED` and `PROCESSING` orders; and
- sale time within the week, falling back to completion time and then creation time.

Do not manually enter or upsert the Pet Resort headline value into `FinanceWeeklyKpiHeadline`. Refresh the MoeGo sync if the underlying order data is stale, then reload the KPI page.

## Mobile Grooming net sales

Continue to source **Planet Pooch** Mobile Grooming from MoeGo's browser-visible **Sales summary report**, **Based on sale date**, using the requested Sunday-Saturday range and the Planet Pooch business filter. Record the Total row's **Total net sales** and upsert it into `FinanceWeeklyKpiHeadline.mobileNetSalesCents` for that Sunday `weekStart`.

The KPI page matches Pet Resort payroll rows whose `payPeriod` is the same Sunday-Saturday range, sums all matching payroll runs, and shows payroll divided by the automatically calculated Resort net sales. If there is no matching payroll run, leave the payroll amount and percentage unresolved rather than substituting another pay period.

## Reconciliation rules

- Keep each business separate; never use **All businesses** for a segment headline.
- Net sales is distinct from Total collected, Total expected, and Total gross sales.
- Do not substitute a client-list Total paid view or a payment report for Mobile Grooming.
- Do not expose client names, phone numbers, invoice details, or other row-level information in the KPI report.
- If the browser session is logged out or the Sales Summary report cannot be verified, leave Mobile Grooming unresolved and report the blocker.

## Remaining KPIs

Continue using the existing KPI sources and segment rules for all non-headline metrics. The headline calculations do not redefine revenue inside narrower service KPIs such as daycare, boarding, training, or grooming.

## Slack delivery

After the report has been refreshed and verified, post a concise summary to the designated weekly KPI Slack channel. Include:

- the inclusive Sunday-Saturday date range;
- Planet Pooch net sales;
- Planet Pooch Pet Resort net sales;
- Pet Resort payroll and payroll as a percentage of Resort net sales; and
- a link to the completed All-segments KPI report for that week.

Do not include client-level or employee-level details. Verify that Slack shows the message as sent before treating the workflow as complete. If no Slack connection, logged-in session, or destination channel is available, leave delivery unresolved and report that blocker rather than claiming the report was posted.
