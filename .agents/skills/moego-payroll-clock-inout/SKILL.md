---
name: moego-payroll-clock-inout
description: Pull, summarize, and upload MoeGo payroll clock-in/out data from the Clock in/out record page. Use when the user asks for MoeGo payroll, clock-in/out, timecard, hours worked, staff hour totals, weekly payroll totals, or storing/uploading payroll hours to the Planet Pooch finance payroll page, especially for Planet Pooch Pet Resort Sunday-Saturday weeks.
---

# MoeGo Payroll Clock In/Out

## Workflow

Use the Browser skill and the in-app browser for this workflow. The user must already be logged in to MoeGo, or must log in manually when prompted.

1. Open or reuse `https://go.moego.pet/setting/staff/clockInout?%7Ec=9219&%7Eb=119538`.
2. Confirm the page is `Settings > Staff > Clock in/out` and the `Clock in/out record` company label is `Planet Pooch Pet Resort`.
3. Set the date range to a full Sunday-Saturday week. For unattended weekly payroll runs, use the most recent completed Sunday-Saturday week.
4. Set the page-size control at the bottom of the table to `100/page`.
5. Verify the table headers are `Name`, `Date`, `Time`, and `Total hours`.
6. Run `scripts/extract-clock-inout-page.js` through `tab.playwright.evaluate(...)` against the visible page.
7. If the result reports more available rows than visible rows or pagination beyond page 1, navigate through all pages and combine rows before finalizing. Otherwise, use the returned totals directly.
8. When the user asks to store or upload the payroll data, upload `result.payrollUpload` to the Planet Pooch portal payroll API from an authenticated Planet Pooch portal page.

## Extractor

The extractor is a browser-page script, not a standalone Node CLI. Resolve the script path relative to this skill's `SKILL.md` location, then read that absolute path:

```js
var fs = await import("node:fs/promises");
var source = await fs.readFile("<absolute path to this skill>/scripts/extract-clock-inout-page.js", "utf8");
var result = await tab.playwright.evaluate(source, undefined, { timeoutMs: 5000 });
```

The script returns:

- `dateRange`: the two MoeGo date inputs.
- `pageSizeText`: the visible page-size control text, such as `100/page`.
- `rows`: parsed clock-in/out rows.
- `totals`: one row per employee name, combined case-insensitively after trimming whitespace.
- `payrollUpload`: an app-ready payload for `POST` or `PUT /api/finance/payroll`, containing `weekStart`, `weekEnd`, `source`, `notes`, and employee rows.
- `warnings`: conditions that need human review, such as missing date inputs, page size not set to 100, or row parse failures.

## Duration Math

Always convert each `Total hours` value to seconds before summing. MoeGo durations can look like `7h 21mins 55secs`, `45mins 0secs`, or `8h 0mins`. Do not concatenate or separately total hours/minutes/seconds.

Format final totals as both:

- `Hh Mmins Ssecs`
- Decimal hours rounded to two places

## Upload to Portal

Use this when the user asks to upload, store, or save the MoeGo payroll totals in the repo app.

1. Verify `result.payrollUpload` is not null and the date range is the target Sunday-Saturday week.
2. Open or reuse the Planet Pooch portal at `/finance/payroll` on the local app origin. If no portal tab is known, try `http://localhost:3000/finance/payroll`.
3. Make sure the portal page is authenticated as `SUPER_ADMIN` or legacy `ADMIN`. If the API returns `403`, ask the user to sign in to the portal and retry.
4. Run the upload from the portal origin so same-origin cookies are included:

```js
await fetch("/api/finance/payroll", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(result.payrollUpload),
}).then(async (response) => {
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Payroll upload failed");
  return json;
});
```

5. Confirm the returned `week.weekStart`, `week.weekEnd`, `rows`, and `categoryTotals`.

## Output

Report the selected date range, row count, and employee totals. If uploaded, also report that the week was saved in `/finance/payroll`. Include warnings if present. Do not include raw row-level clock-in/out records unless the user explicitly asks for the detail.
