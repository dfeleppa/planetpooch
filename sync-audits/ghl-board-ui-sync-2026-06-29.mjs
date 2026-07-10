import { readFile, writeFile } from "node:fs/promises";

const SEARCH_SELECTOR = "input#list-view-record-search";
const CARD_SELECTOR = ".cardWrapper.crm-opportunities-card-wrapper";
const PHONE_SELECTOR = "#ContactPhone input";
const VALUE_SELECTOR = "#OpportunityLeadValue input[type='number']";
const STATUS_SELECTOR = "#OpportunityStatus";
const UPDATE_SELECTOR = "#CreateUpdateOpportunity";
const CLOSE_SELECTOR = "#modal-header-modal-close-btn";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digits = (value) => String(value || "").replace(/\D/g, "");
const last10 = (value) => digits(value).slice(-10);
const moneyNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
};
const sameMoney = (a, b) => Math.abs(moneyNumber(a) - moneyNumber(b)) < 0.01;

async function readJson(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

export async function loadExistingAudit(auditPath) {
  try {
    return await readJson(auditPath);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function loadPlanRows(planPath) {
  const plan = await readJson(planPath);
  return (plan.candidates || []).map((candidate, index) => ({
    idx: index,
    name: String(candidate.moegoName || candidate.ghlName || "").trim(),
    phone: String(candidate.phone || "").trim(),
    paid: moneyNumber(candidate.moegoTotalNumber ?? candidate.moegoTotal),
    reason: candidate.reason || "",
    source: candidate.source || "",
    currentValue: candidate.currentValue,
    currentValueText: candidate.currentValueText,
    ghlName: candidate.ghlName || "",
    moegoTotal: candidate.moegoTotal || "",
  })).filter((row) => row.phone && Number.isFinite(row.paid));
}

export function summarize(results) {
  return (results || []).reduce((acc, result) => {
    const key = result.action || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export async function createBoardSync({
  browser,
  tab,
  rows,
  planPath,
  auditPath,
  initialState,
  pauseAfterSearchMs = 4200,
} = {}) {
  let activeTab = tab;
  const normalizedRows = rows || await loadPlanRows(planPath);
  const state = initialState || {
    createdAt: new Date().toISOString(),
    planPath,
    auditPath,
    nextIndex: 0,
    results: [],
  };

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

  const locatorCount = async (selector) => runWithTabRetry((currentTab) => (
    currentTab.playwright.locator(selector).count()
  ));

  const pageRead = async (fn, arg, timeoutMs = 7000) => runWithTabRetry((currentTab) => (
    currentTab.playwright.evaluate(fn, arg, { timeoutMs })
  ));

  const fillUnique = async (selector, value) => runWithTabRetry(async (currentTab) => {
    const locator = currentTab.playwright.locator(selector);
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one ${selector}, found ${count}`);
    await locator.fill(value);
  });

  const clickUnique = async (selector) => runWithTabRetry(async (currentTab) => {
    const locator = currentTab.playwright.locator(selector);
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one ${selector}, found ${count}`);
    await locator.click({ timeoutMs: 5000 });
  });

  const clickPoint = async (point) => runWithTabRetry((currentTab) => (
    currentTab.cua.click({ x: Math.round(point.x), y: Math.round(point.y) })
  ));

  const waitForSelectorCount = async (selector, expected, timeoutMs = 8000) => {
    const start = Date.now();
    let last = -1;
    while (Date.now() - start < timeoutMs) {
      last = await locatorCount(selector).catch(() => -1);
      if (last === expected) return true;
      await sleep(350);
    }
    return false;
  };

  const closeModal = async () => {
    const isOpen = await locatorCount(PHONE_SELECTOR).catch(() => 0);
    if (!isOpen) return false;

    const closePoint = await pageRead((selector) => {
      const button = document.querySelector(selector);
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, CLOSE_SELECTOR).catch(() => null);

    if (closePoint) {
      await clickPoint(closePoint);
    } else {
      await runWithTabRetry((currentTab) => currentTab.cua.keypress({ keys: ["ESC"] }));
    }

    await waitForSelectorCount(PHONE_SELECTOR, 0, 6000);
    return true;
  };

  const ensureNoModal = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const count = await locatorCount(PHONE_SELECTOR).catch(() => 0);
      if (!count) return;
      await closeModal();
    }
  };

  const searchPhone = async (phone) => {
    await ensureNoModal();
    await fillUnique(SEARCH_SELECTOR, "");
    await sleep(500);
    await fillUnique(SEARCH_SELECTOR, phone);
    await sleep(pauseAfterSearchMs);
  };

  const readVisibleCards = async () => pageRead((selector) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        style.display !== "none" &&
        style.visibility !== "hidden";
    };

    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .slice(0, 12)
      .map((card, index) => {
        const rect = card.getBoundingClientRect();
        const bodyY = rect.top + Math.min(rect.height - 18, Math.max(70, rect.height * 0.65));
        return {
          index,
          text: clean(card.innerText || card.textContent),
          x: rect.left + rect.width / 2,
          y: bodyY,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
        };
      });
  }, CARD_SELECTOR);

  const openCard = async (card) => {
    await clickPoint({ x: card.x, y: card.y });
    const opened = await waitForSelectorCount(PHONE_SELECTOR, 1, 9000);
    if (opened) return true;

    const url = await runWithTabRetry((currentTab) => currentTab.url());
    if (/\/customers\/detail\//i.test(url || "")) {
      await runWithTabRetry((currentTab) => currentTab.back());
      await sleep(1800);
      throw new Error("Opened contact record instead of opportunity modal");
    }
    throw new Error("Opportunity modal did not open");
  };

  const readModal = async () => pageRead(({ phoneSelector, valueSelector, statusSelector }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const valueOf = (selector) => {
      const element = document.querySelector(selector);
      return element ? ("value" in element ? element.value : clean(element.innerText || element.textContent)) : "";
    };
    const heading = clean(document.querySelector("#modal h2, #modal [class*='header']")?.innerText || "");
    return {
      opportunityName: heading,
      phone: valueOf(phoneSelector),
      value: valueOf(valueSelector),
      status: valueOf(statusSelector),
      url: location.href,
    };
  }, {
    phoneSelector: PHONE_SELECTOR,
    valueSelector: VALUE_SELECTOR,
    statusSelector: STATUS_SELECTOR,
  });

  const setStatusWon = async () => {
    await clickUnique(STATUS_SELECTOR);
    await sleep(850);

    const wonPoint = await pageRead(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const selectors = ".hr-base-select-option, [role='option'], .n-base-select-option, .select-option";
      const won = Array.from(document.querySelectorAll(selectors))
        .filter(visible)
        .find((option) => clean(option.innerText || option.textContent).toLowerCase() === "won");
      if (!won) return null;
      const rect = won.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    if (!wonPoint) throw new Error("Won option not found");
    await clickPoint(wonPoint);
    await sleep(700);
    return { method: "coordinate-option-click" };
  };

  const updateOpenModal = async (row, before = null) => {
    const modalBefore = before || await readModal();
    const phoneMatches = last10(modalBefore.phone) === last10(row.phone);
    if (!phoneMatches) {
      return { action: "skip_phone_mismatch", before: modalBefore, after: modalBefore, phoneMatches };
    }

    const needValue = !sameMoney(modalBefore.value, row.paid);
    const needStatus = row.paid > 0 && !/\bwon\b/i.test(String(modalBefore.status || ""));
    let statusSet = null;

    if (!needValue && !needStatus) {
      return { action: "no_change_modal", before: modalBefore, after: modalBefore, phoneMatches };
    }

    if (needValue) await fillUnique(VALUE_SELECTOR, row.paid.toFixed(2));
    if (needStatus) statusSet = await setStatusWon();

    const afterFill = await readModal().catch(() => null);
    try {
      await clickUnique(UPDATE_SELECTOR);
    } catch {
      const point = await pageRead((selector) => {
        const button = document.querySelector(selector);
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, UPDATE_SELECTOR);
      if (!point) throw new Error("Update button not found");
      await clickPoint(point);
    }
    await sleep(5000);

    const stillOpen = await locatorCount(PHONE_SELECTOR).catch(() => 0);
    const after = stillOpen ? await readModal().catch(() => null) : null;
    return {
      action: "updated",
      before: modalBefore,
      afterFill,
      after,
      phoneMatches,
      needValue,
      needStatus,
      statusSet,
      saved: after ? sameMoney(after.value, row.paid) && (row.paid <= 0 || /\bwon\b/i.test(String(after.status || ""))) : null,
    };
  };

  const processOne = async (row) => {
    const base = {
      idx: row.idx,
      name: row.name,
      phone: row.phone,
      paid: row.paid,
      reason: row.reason,
      source: row.source,
      currentValue: row.currentValue,
      currentValueText: row.currentValueText,
      ghlName: row.ghlName,
      moegoTotal: row.moegoTotal,
    };

    try {
      await searchPhone(row.phone);
      let cards = await readVisibleCards();
      if (!cards.length) {
        await sleep(1200);
        cards = await readVisibleCards();
      }
      if (!cards.length) return { ...base, action: "no_match_after_search", rowCount: 0, cards: [] };

      const verified = [];
      for (const card of cards) {
        await openCard(card);
        const modal = await readModal();
        const phoneMatches = last10(modal.phone) === last10(row.phone);
        let update = { action: "skip_phone_mismatch", before: modal, after: modal, phoneMatches };
        if (phoneMatches) update = await updateOpenModal(row, modal);

        verified.push({ card, modal, phoneMatches, update });
        await closeModal();

        if (phoneMatches) {
          return {
            ...base,
            action: update.action,
            rowCount: cards.length,
            cards,
            verified,
          };
        }
      }

      return { ...base, action: "no_match_after_search", rowCount: cards.length, cards, verified };
    } catch (error) {
      try {
        await closeModal();
      } catch {}
      return {
        ...base,
        action: "error",
        error: String(error && error.message ? error.message : error),
      };
    }
  };

  const replaceOrAppendResult = (result) => {
    const existingIndex = state.results.findIndex((item) => item.idx === result.idx);
    if (existingIndex >= 0) state.results[existingIndex] = result;
    else state.results.push(result);
  };

  const save = async () => {
    if (!auditPath) return null;
    state.updatedAt = new Date().toISOString();
    state.summary = summarize(state.results);
    await writeFile(auditPath, JSON.stringify(state, null, 2), "utf8");
    return auditPath;
  };

  const processBatch = async (batchSize = 1) => {
    const start = state.nextIndex || 0;
    const end = Math.min(start + batchSize, normalizedRows.length);
    const batch = [];
    for (let index = start; index < end; index += 1) {
      const result = await processOne(normalizedRows[index]);
      batch.push(result);
      replaceOrAppendResult(result);
      state.nextIndex = index + 1;
      await save();
    }
    return {
      start,
      end,
      nextIndex: state.nextIndex,
      batch,
      batchSummary: summarize(batch),
      totalSummary: summarize(state.results),
    };
  };

  return {
    state,
    rows: normalizedRows,
    setTab(nextTab) { activeTab = nextTab; },
    searchPhone,
    readVisibleCards,
    readModal,
    closeModal,
    processOne,
    processBatch,
    save,
    summarize: () => summarize(state.results),
  };
}
