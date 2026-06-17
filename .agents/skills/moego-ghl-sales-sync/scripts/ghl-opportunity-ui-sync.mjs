import { writeFile } from "node:fs/promises";

const SEARCH_SELECTOR = "input#list-view-record-search";
const ROW_SELECTOR = ".tabulator-row[role='row']";
const PHONE_SELECTOR = "#ContactPhone input";
const VALUE_SELECTOR = "#OpportunityLeadValue input[type='number']";
const STATUS_SELECTOR = "#OpportunityStatus";
const UPDATE_SELECTOR = "#CreateUpdateOpportunity";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digits = (value) => String(value || "").replace(/\D/g, "");
const last10 = (value) => digits(value).slice(-10);
const moneyNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
};
const sameMoney = (a, b) => Math.abs(moneyNumber(a) - moneyNumber(b)) < 0.01;

export function normalizeMoegoRows(rows) {
  return (rows || [])
    .map((row, idx) => {
      const paid = moneyNumber(row.totalPaidNumber ?? row.totalPaid ?? row.paid);
      return {
        ...row,
        idx: row.idx ?? idx,
        name: String(row.name || "").trim(),
        phone: String(row.phone || "").trim(),
        paid,
        digits: digits(row.phone),
      };
    })
    .filter((row) => row.name && row.phone && row.paid > 0);
}

export function createGhlUiSync({ browser, tab, rows, auditPath, initialState } = {}) {
  const state = initialState || { nextIndex: 0, results: [] };
  const normalizedRows = normalizeMoegoRows(rows || []);
  let activeTab = tab;

  const getTab = async () => {
    if (activeTab) return activeTab;
    if (!browser) throw new Error("A browser or tab is required.");
    activeTab = await browser.tabs.selected();
    return activeTab;
  };

  const runWithTabRetry = async (fn) => {
    try {
      return await fn(await getTab());
    } catch (error) {
      if (browser && /Tab not found/i.test(String(error && error.message))) {
        activeTab = await browser.tabs.selected();
        return await fn(activeTab);
      }
      throw error;
    }
  };

  const evaluate = (source, arg, timeoutMs = 10000) => runWithTabRetry((currentTab) => {
    return currentTab.playwright.evaluate(source, arg, { timeoutMs });
  });

  const withLocator = (selector, action) => runWithTabRetry(async (currentTab) => {
    return action(currentTab.playwright.locator(selector));
  });

  const searchPhone = async (phone) => {
    await withLocator(SEARCH_SELECTOR, (search) => search.fill(""));
    await sleep(500);
    await withLocator(SEARCH_SELECTOR, (search) => search.fill(phone));
    await sleep(3600);
    return getRows();
  };

  const getRows = async () => evaluate(`(selector) => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    return Array.from(document.querySelectorAll(selector)).map((row, rowIndex) => {
      const fields = {};
      for (const field of row.querySelectorAll("[tabulator-field]")) {
        fields[field.getAttribute("tabulator-field")] = clean(field.innerText || field.textContent);
      }
      return { rowIndex, text: clean(row.innerText || row.textContent), fields };
    });
  }`, ROW_SELECTOR);

  const openRowByIndex = async (rowIndex) => {
    await evaluate(`({ rowSelector, rowIndex }) => {
      const rows = Array.from(document.querySelectorAll(rowSelector));
      const row = rows[rowIndex];
      if (!row) throw new Error("GHL row not found at index " + rowIndex);
      const target = row.querySelector("[tabulator-field='name']") || row;
      target.click();
      return true;
    }`, { rowSelector: ROW_SELECTOR, rowIndex });
    await sleep(1200);
  };

  const readModal = async () => evaluate(`(selectors) => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const valueOf = (selector) => {
      const element = document.querySelector(selector);
      return element ? ("value" in element ? element.value : clean(element.innerText || element.textContent)) : "";
    };
    const title = clean(document.body.innerText || "");
    const heading = Array.from(document.querySelectorAll("input, textarea"))
      .map((input) => input.value || "")
      .find((value) => /Website lead|Meta|Resort|Boarding|lead/i.test(value));
    return {
      opportunityName: heading || clean((document.querySelector("[data-testid='opportunity-name'], input[name='name']") || {}).value || ""),
      phone: valueOf(selectors.phone),
      value: valueOf(selectors.value),
      status: valueOf(selectors.status),
      title
    };
  }`, { phone: PHONE_SELECTOR, value: VALUE_SELECTOR, status: STATUS_SELECTOR });

  const closeModal = async () => {
    await evaluate(`() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const close = buttons.find((button) => /close modal/i.test(button.getAttribute("aria-label") || button.innerText || ""));
      if (close) close.click();
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return true;
    }`);
    await sleep(1000);
  };

  const fillValue = async (paid) => {
    await withLocator(VALUE_SELECTOR, (valueInput) => valueInput.fill(String(paid.toFixed(2))));
    await sleep(250);
  };

  const setStatusWon = async () => {
    await evaluate(`(selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Status selector not found");
      element.click();
      return true;
    }`, STATUS_SELECTOR);
    await sleep(1500);

    const clicked = await evaluate(`() => {
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const selectors = ".hr-base-select-option, [role='option'], .n-base-select-option, .select-option";
      const options = Array.from(document.querySelectorAll(selectors)).filter(visible);
      const won = options.find((option) => clean(option.innerText || option.textContent).toLowerCase() === "won");
      if (!won) return { clicked: false, reason: "Won option not found" };
      won.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      won.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      won.click();
      return { clicked: true };
    }`);

    await sleep(500);
    if (!clicked.clicked) throw new Error(clicked.reason || "Could not set GHL status to Won");
    return { method: "dom-option-click" };
  };

  const clickUpdate = async () => {
    await withLocator(UPDATE_SELECTOR, (button) => button.click());
    await sleep(9000);
  };

  const updateOpenModal = async (row) => {
    const before = await readModal();
    const phoneMatches = last10(before.phone) === last10(row.phone);
    if (!phoneMatches) return { action: "skip_phone_mismatch", before, after: before, phoneMatches };

    const needValue = !sameMoney(before.value, row.paid);
    const needStatus = row.paid > 0 && !/\bwon\b/i.test(String(before.status || ""));
    let statusSet = null;

    if (!needValue && !needStatus) {
      return { action: "no_change", before, after: before, phoneMatches };
    }

    if (needValue) await fillValue(row.paid);
    if (needStatus) statusSet = await setStatusWon();
    await clickUpdate();

    const after = await readModal();
    return {
      action: "updated",
      before,
      after,
      phoneMatches,
      needValue,
      needStatus,
      statusSet,
      saved: sameMoney(after.value, row.paid) && /\bwon\b/i.test(String(after.status || "")),
    };
  };

  const processOne = async (row) => {
    const base = {
      idx: row.idx,
      name: row.name,
      phone: row.phone,
      paid: row.paid,
      searchValue: row.phone,
    };

    try {
      const rowsFound = await searchPhone(row.phone);
      if (!rowsFound.length) return { ...base, action: "no_match", rowCount: 0, rows: [] };

      const verified = [];
      for (const found of rowsFound) {
        await openRowByIndex(found.rowIndex);
        const modal = await readModal();
        const phoneMatches = last10(modal.phone) === last10(row.phone);
        let update = { action: "skip_phone_mismatch", before: modal, after: modal, phoneMatches };
        if (phoneMatches) update = await updateOpenModal(row);
        verified.push({ rowIndex: found.rowIndex, rowText: found.text, modal, phoneMatches, update });
        await closeModal();
        if (phoneMatches) {
          return { ...base, action: update.action === "updated" ? "updated" : "no_change", rowCount: rowsFound.length, rows: rowsFound, verified };
        }
      }

      return { ...base, action: "no_match", rowCount: rowsFound.length, rows: rowsFound, verified };
    } catch (error) {
      try { await closeModal(); } catch {}
      return { ...base, action: "error", error: String(error && error.message ? error.message : error) };
    }
  };

  const replaceOrAppendResult = (result) => {
    const existingIndex = state.results.findIndex((item) => item.idx === result.idx);
    if (existingIndex >= 0) state.results[existingIndex] = result;
    else state.results.push(result);
  };

  const processBatch = async (batchSize = 8) => {
    const start = state.nextIndex || 0;
    const end = Math.min(start + batchSize, normalizedRows.length);
    const batch = [];

    for (let index = start; index < end; index += 1) {
      const result = await processOne(normalizedRows[index]);
      batch.push(result);
      replaceOrAppendResult(result);
      state.nextIndex = index + 1;
    }

    if (auditPath) await save();

    return {
      start,
      end,
      nextIndex: state.nextIndex,
      batch,
      batchSummary: summarize(batch),
      totalSummary: summarize(state.results),
    };
  };

  const retryIndex = async (idx) => {
    const row = normalizedRows.find((candidate) => candidate.idx === idx);
    if (!row) throw new Error(`No MoeGo row found for idx ${idx}`);
    const result = await processOne(row);
    replaceOrAppendResult(result);
    return result;
  };

  const save = async () => {
    if (!auditPath) return null;
    await writeFile(auditPath, JSON.stringify(state, null, 2), "utf8");
    return auditPath;
  };

  return {
    state,
    rows: normalizedRows,
    setTab(nextTab) { activeTab = nextTab; },
    getTab,
    searchPhone,
    getRows,
    processOne,
    processBatch,
    retryIndex,
    save,
    summarize: () => summarize(state.results),
  };
}

export function summarize(results) {
  return (results || []).reduce((acc, result) => {
    const key = result.action || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
