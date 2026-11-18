BEGIN;

CREATE TABLE "CorporateMeetingNote" (
  "id" TEXT PRIMARY KEY,
  "meetingDate" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "CorporateMeetingNote" ENABLE ROW LEVEL SECURITY;

INSERT INTO "CorporateMeetingNote" ("id", "meetingDate", "title", "body")
VALUES ('meeting-2026-11-18-lsa', '2026-11-18', 'Meeting summary', $notes$**Main takeaway:** We need customer lifetime value and spending patterns by business segment to determine whether our acquisition costs are acceptable.

### Google LSA results

*September 18–November 18*

| Metric | Result |
| --- | --- |
| Ad spend | $3,892 |
| Leads | 139 |
| Recorded in CRM | 51 — 36.7% |
| Paying customers | 8 |
| Cost per lead | $28 |
| Customer acquisition cost | $486.50 |
| Revenue attributed so far | Approximately $1,600 |

If two more leads convert, CAC falls to **$389**. The team felt **$400 CAC could be acceptable**, pending customer value and profitability data.

Reported CAC rose from **$315 in September–October to $658 in October–November**. Possible explanations include recent leads needing more time to convert and the removal of mobile grooming from LSA. Neither is confirmed.

The share of calls recorded in the CRM also appears to have declined as spending increased.

**Payback example:** A boarding customer spending $1,800 annually averages $34.62 weekly. A $300 CAC takes approximately **61 days to recover in revenue**; actual gross-profit break-even takes longer.

## Action items

- **Calculate customer value by segment:** Mobile grooming, in-house grooming, daycare, boarding, and training. Include annual revenue, lifetime revenue, and lifetime gross profit.
- **Measure spending speed:** Customer spending in the first 30, 60, 90, and 365 days, plus weekly averages.
- **Add CAC payback to the marketing app:** Days/weeks to recover acquisition costs, distinguishing revenue recovery from gross-profit break-even.
- **Audit the LSA funnel:** Track leads through CRM entry, MoeGo booking, and first payment; investigate the recent recording decline.
- **Compare performance fairly:** Separate results by service and give each lead group equal time to convert.
- **Set CAC targets by segment:** Use customer value, profitability, and payback findings.

*Owners and deadlines still need to be assigned.*$notes$);

COMMIT;
