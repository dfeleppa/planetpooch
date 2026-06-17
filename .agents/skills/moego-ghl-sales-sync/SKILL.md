---
name: moego-ghl-sales-sync
description: Pull MoeGo paid-sales/client payment rows and update matching GoHighLevel opportunities through the browser UI. Use when the user asks to sync MoeGo sales, paid 1 week client totals, names, phone numbers, or total paid values into GHL/GoHighLevel opportunities, especially when updates must search by phone, verify the opportunity contact phone, update value/total paid, and set positive-value opportunities to Won without using the GHL API.
---

# MoeGo GHL Sales Sync

## Workflow

Use the Browser skill and the in-app browser. This workflow depends on the user's logged-in MoeGo and GoHighLevel sessions. Do not use the GoHighLevel API unless the user explicitly reverses the UI-only instruction.

1. Open MoeGo at `https://go.moego.pet/client?%7Ec=9219&%7Eb=119538`.
2. Click the `Paid (1 week)` view.
3. Increase table page size to `50/page` if available.
4. Extract every page of MoeGo rows with `scripts/extract-moego-paid-sales-page.js`.
5. Save the MoeGo source rows as dated JSON and CSV before touching GHL.
6. Open GHL at `https://app.gohighlevel.com/v2/location/VTEP6J1ff7QqxD4YdqR8/opportunities`.
7. Confirm the advanced filter status is `Is any of` all four statuses: `Open`, `Won`, `Lost`, and `Abandon`. Do not rely only on the view title.
8. Search each MoeGo phone number in the GHL opportunity search field.
9. Open each result, verify the modal contact phone matches the MoeGo phone, then update:
   - Set the opportunity value to MoeGo `totalPaid`.
   - If `totalPaid` is positive and status is not `Won`, set status to `Won`.
10. Save an audit JSON after every small batch and at the end.

## MoeGo Extraction

The extractor is a browser-page script. Resolve the script path relative to this skill folder, read it, then run it against the visible MoeGo page:

```js
var fs = await import("node:fs/promises");
var source = await fs.readFile("<absolute skill path>/scripts/extract-moego-paid-sales-page.js", "utf8");
var result = await tab.playwright.evaluate(source, undefined, { timeoutMs: 10000 });
```

The script returns:

- `rows`: `{ name, phone, totalPaid, totalPaidNumber }`
- `headers`: detected table headers
- `pageSizeText`: visible page-size label, if found
- `warnings`: extraction warnings

If pagination exists, navigate through all pages and append `result.rows`. Deduplicate only if the same name, phone, and total paid repeat because the page failed to change.

## GHL Update Helper

Use `scripts/ghl-opportunity-ui-sync.mjs` from the Node REPL after GHL is open and the filter is confirmed:

```js
var { pathToFileURL } = await import("node:url");
var mod = await import(pathToFileURL("<absolute skill path>/scripts/ghl-opportunity-ui-sync.mjs").href + "?v=" + Date.now());
var tab = await browser.tabs.selected();
var rows = mod.normalizeMoegoRows(moegoRows);
var sync = mod.createGhlUiSync({
  browser,
  tab,
  rows,
  auditPath: "C:/Users/Daniel/Documents/Planet Pooch/ghl-ui-update-results-YYYY-MM-DD.json"
});
var batch = await sync.processBatch(8);
await sync.save();
```

Continue batches until `sync.state.nextIndex === rows.length`. If the browser tab handle changes, call `sync.setTab(await browser.tabs.selected())` and retry the failed row or continue from `nextIndex`.

## Safety Rules

- Never update a GHL row only because it appears in search results. Open the modal and verify `#ContactPhone input` matches the MoeGo phone by last 10 digits.
- Do not create opportunities during this workflow.
- Do not update a modal if the phone does not match, even when the name looks close.
- Treat `Open`, `Won`, `Lost`, and `Abandon` as eligible search statuses; positive MoeGo paid value should end as `Won`.
- Keep batch sizes small, usually 5-10 rows, because GHL search results can briefly show stale rows while loading.
- After technical errors such as `Tab not found`, rebind the tab and retry those exact rows; do not count them as business no-matches.

## Output

Report:

- MoeGo row count and selected view/date range when known.
- GHL counts: updated, already correct/no change, no match, and errors.
- Any status changes to `Won`.
- The absolute path of the MoeGo source JSON/CSV and the GHL audit JSON.

Only include the detailed row list when the user asks or when there are errors needing review.
