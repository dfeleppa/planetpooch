import { readFile, writeFile } from "node:fs/promises";

const paths = {
  currentCsv: "C:/Users/Daniel/Downloads/MoeGo-Export-Client-PlanetPooch-2026-07-10-14-14-58.csv",
  lastAppliedCsv: "C:/Users/Daniel/Downloads/MoeGo-Export-Client-PlanetPooch-2026-07-06-15-17-08.csv",
  previousCsv: "C:/Users/Daniel/Downloads/MoeGo-Export-Client-PlanetPooch-2026-06-29-19-04-50.csv",
  lastAppliedNormalized: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/moego-client-export-normalized-2026-07-06.json",
  previousNormalized: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/moego-client-export-normalized-2026-06-29.json",
  ghlList: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/ghl-opportunity-list-2026-06-26.json",
  lastAppliedAudit: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/ghl-ui-update-results-2026-07-06.json",
  normalizedOut: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/moego-client-export-normalized-2026-07-10.json",
  conflictsOut: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/moego-client-export-phone-conflicts-2026-07-10.json",
  planOut: "C:/Users/Daniel/Documents/Planet Pooch/sync-audits/ghl-moego-delta-plan-2026-07-10.json",
};

const digits = (value) => String(value || "").replace(/\D/g, "");
const last10 = (value) => digits(value).slice(-10);
const moneyNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
};
const moneyText = (value) => `$${Number(value || 0).toFixed(2).replace(/\.00$/, "")}`;
const sameMoney = (a, b) => Math.abs(moneyNumber(a) - moneyNumber(b)) < 0.01;

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;

  const pushField = () => {
    row.push(field.replace(/^\t+|\t+$/g, ""));
    field = "";
    afterQuote = false;
  };

  const pushRow = () => {
    if (row.length || field.length) pushField();
    if (row.some((value) => String(value).trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
        afterQuote = true;
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuote && (char === "\t" || char === " ")) continue;

    if (char === '"') {
      inQuotes = true;
      afterQuote = false;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\r") continue;
    if (char === "\n") {
      pushRow();
      continue;
    }

    field += char;
    afterQuote = false;
  }

  if (field.length || row.length) pushRow();
  if (!rows.length) return [];

  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [
    header,
    values[index] ?? "",
  ])));
}

async function readJson(path) {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

async function readMoegoCsv(path) {
  return parseCsv((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

function normalizeName(row) {
  return `${row["First name"] || ""} ${row["Last name"] || ""}`.replace(/\s+/g, " ").trim();
}

function normalizeMoegoRows(rows) {
  return rows.map((row, idx) => {
    const phone = last10(row["Primary contact"]);
    const total = moneyNumber(row["Total sales"]);
    return {
      idx,
      name: normalizeName(row),
      phone,
      phoneRaw: String(row["Primary contact"] || "").trim(),
      totalPaid: row["Total sales"],
      totalPaidNumber: total,
      status: row.status || "",
      email: row.email || "",
      createDate: row["create date"] || "",
    };
  }).filter((row) => row.phone.length === 10);
}

async function readMoegoSource(csvPath, normalizedPath = null) {
  try {
    const rawRows = await readMoegoCsv(csvPath);
    return {
      rawRows: rawRows.length,
      rows: normalizeMoegoRows(rawRows),
      source: csvPath,
    };
  } catch (error) {
    if (!(error && error.code === "ENOENT") || !normalizedPath) throw error;
    const normalized = await readJson(normalizedPath);
    const rows = (normalized.rows || []).map((row, index) => ({
      idx: row.idx ?? index,
      name: row.name || "",
      phone: last10(row.phone || row.phoneRaw),
      phoneRaw: row.phoneRaw || row.phone || "",
      totalPaid: row.totalPaid || moneyText(row.totalPaidNumber),
      totalPaidNumber: moneyNumber(row.totalPaidNumber ?? row.totalPaid),
      status: row.status || "",
      email: row.email || "",
      createDate: row.createDate || "",
    })).filter((row) => row.phone.length === 10);
    return {
      rawRows: normalized.rawRows ?? rows.length,
      rows,
      source: normalizedPath,
    };
  }
}

function uniqueByPhone(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.phone)) groups.set(row.phone, []);
    groups.get(row.phone).push(row);
  }

  const unique = new Map();
  const conflicts = [];
  for (const [phone, group] of groups) {
    const totals = [...new Set(group.map((row) => row.totalPaidNumber.toFixed(2)))];
    if (totals.length > 1) {
      conflicts.push({
        phone,
        totals,
        rows: group.map((row) => ({
          idx: row.idx,
          name: row.name,
          totalPaid: row.totalPaid,
          totalPaidNumber: row.totalPaidNumber,
          phoneRaw: row.phoneRaw,
        })),
      });
      continue;
    }
    unique.set(phone, group[0]);
  }

  return { unique, conflicts };
}

function buildKnownGhlMap(list, audit) {
  const known = new Map();
  for (const row of list.rows || []) {
    const phone = row.last10 || last10(row.phoneText || row.phoneDigits);
    if (!phone) continue;
    if (!known.has(phone)) {
      known.set(phone, {
        phone,
        ghlName: row.name || "",
        currentValue: moneyNumber(row.value ?? row.valueText),
        currentValueText: row.valueText || moneyText(row.value),
        source: "prev-ghl-list",
        knownRows: [],
      });
    }
    known.get(phone).knownRows.push({
      name: row.name || "",
      value: moneyNumber(row.value ?? row.valueText),
      valueText: row.valueText || "",
      page: row.page,
    });
  }

  for (const result of audit.results || []) {
    const phone = result.phone || result.last10 || last10(result.before?.phone || "");
    if (!phone) continue;
    const verified = (result.verified || []).find((item) => item.phoneMatches || item.update?.phoneMatches);
    const update = verified?.update || {};
    const phoneMatches = result.phoneMatches || verified?.phoneMatches || update.phoneMatches;
    const action = result.action || "";
    if (action !== "updated" && !/no_change/i.test(action)) continue;

    if (!known.has(phone)) {
      known.set(phone, {
        phone,
        ghlName: result.ghlName || "",
        currentValue: null,
        currentValueText: "unknown",
        source: "prev-audit",
        knownRows: [],
      });
    }

    const knownRow = known.get(phone);
    if (action === "updated" && phoneMatches) {
      const afterValue = update.after?.value ?? result.after?.value ?? result.moegoTotalNumber ?? result.moegoTotal;
      knownRow.currentValue = moneyNumber(afterValue);
      knownRow.currentValueText = moneyText(knownRow.currentValue);
      knownRow.ghlName = result.ghlName || knownRow.ghlName;
      knownRow.source = "prev-audit-updated";
    } else if (/no_change/i.test(action) && phoneMatches !== false) {
      const beforeValue = update.before?.value ?? result.before?.value ?? result.moegoTotalNumber ?? result.moegoTotal;
      knownRow.currentValue = moneyNumber(beforeValue);
      knownRow.currentValueText = moneyText(knownRow.currentValue);
      knownRow.ghlName = result.ghlName || knownRow.ghlName;
      knownRow.source = "prev-audit-no-change";
    }
  }

  return known;
}

function buildPlan({ currentUnique, currentConflicts, lastAppliedUnique, previousUnique, knownGhl }) {
  const candidates = [];
  const seen = new Set();
  const conflictPhones = new Set(currentConflicts.map((conflict) => conflict.phone));

  const addCandidate = (phone, reason, source, known = null) => {
    if (seen.has(phone) || conflictPhones.has(phone)) return;
    const moego = currentUnique.get(phone);
    if (!moego) return;
    seen.add(phone);
    candidates.push({
      phone,
      ghlName: known?.ghlName || "",
      currentValue: known?.currentValue ?? null,
      currentValueText: known?.currentValueText || "unknown",
      knownRows: known?.knownRows || [],
      moegoName: moego.name,
      moegoTotal: moego.totalPaid || moneyText(moego.totalPaidNumber),
      moegoTotalNumber: moego.totalPaidNumber,
      reason,
      source,
    });
  };

  for (const [phone, known] of knownGhl) {
    const moego = currentUnique.get(phone);
    if (!moego) continue;
    const knownValues = known.knownRows?.length ? known.knownRows.map((row) => row.value) : [known.currentValue];
    const hasMismatch = knownValues.some((value) => !sameMoney(value, moego.totalPaidNumber));
    if (hasMismatch) addCandidate(phone, "known-ghl-value-diff", known.source, known);
  }

  for (const [phone, moego] of currentUnique) {
    if (seen.has(phone) || conflictPhones.has(phone)) continue;
    const lastApplied = lastAppliedUnique.get(phone);
    const previous = previousUnique.get(phone);
    const isNew = !lastApplied;
    const changedSinceApplied = lastApplied && !sameMoney(lastApplied.totalPaidNumber, moego.totalPaidNumber);
    const changedSincePrevious = previous && !sameMoney(previous.totalPaidNumber, moego.totalPaidNumber);

    if (isNew && moego.totalPaidNumber > 0) {
      addCandidate(phone, "new-moego-phone", "moego-delta");
    } else if ((changedSinceApplied || changedSincePrevious) && moego.totalPaidNumber > 0) {
      addCandidate(phone, "moego-total-changed", "moego-delta");
    }
  }

  candidates.sort((a, b) => {
    const rank = {
      "known-ghl-value-diff": 0,
      "moego-total-changed": 1,
      "new-moego-phone": 2,
    };
    return (rank[a.reason] ?? 9) - (rank[b.reason] ?? 9) ||
      Math.abs((b.moegoTotalNumber || 0) - moneyNumber(b.currentValue)) -
      Math.abs((a.moegoTotalNumber || 0) - moneyNumber(a.currentValue));
  });

  return candidates;
}

const [currentSource, lastAppliedSource, previousSource, ghlList, lastAppliedAudit] = await Promise.all([
  readMoegoSource(paths.currentCsv),
  readMoegoSource(paths.lastAppliedCsv, paths.lastAppliedNormalized),
  readMoegoSource(paths.previousCsv, paths.previousNormalized),
  readJson(paths.ghlList),
  readJson(paths.lastAppliedAudit),
]);

const currentRows = currentSource.rows;
const lastAppliedRows = lastAppliedSource.rows;
const previousRows = previousSource.rows;
const current = uniqueByPhone(currentRows);
const lastApplied = uniqueByPhone(lastAppliedRows);
const previous = uniqueByPhone(previousRows);
const knownGhl = buildKnownGhlMap(ghlList, lastAppliedAudit);
const candidates = buildPlan({
  currentUnique: current.unique,
  currentConflicts: current.conflicts,
  lastAppliedUnique: lastApplied.unique,
  previousUnique: previous.unique,
  knownGhl,
});

const normalized = {
  createdAt: new Date().toISOString(),
  csv: paths.currentCsv,
  rawRows: currentSource.rawRows,
  usableRows: currentRows.length,
  uniquePhones: current.unique.size,
  conflictPhones: current.conflicts.length,
  rows: [...current.unique.values()],
};

const conflicts = {
  createdAt: new Date().toISOString(),
  csv: paths.currentCsv,
  conflictPhones: current.conflicts.length,
  conflicts: current.conflicts,
};

const reasonCounts = candidates.reduce((acc, candidate) => {
  acc[candidate.reason] = (acc[candidate.reason] || 0) + 1;
  return acc;
}, {});

const plan = {
  createdAt: new Date().toISOString(),
  currentCsv: paths.currentCsv,
  lastAppliedCsv: paths.lastAppliedCsv,
  previousCsv: paths.previousCsv,
  lastKnownGhlList: paths.ghlList,
  lastAppliedAudit: paths.lastAppliedAudit,
  currentRows: currentSource.rawRows,
  currentUsableRows: currentRows.length,
  currentUniquePhones: current.unique.size,
  currentConflictPhones: current.conflicts.length,
  knownGhlPhones: knownGhl.size,
  candidateCount: candidates.length,
  reasonCounts,
  candidates,
};

await Promise.all([
  writeFile(paths.normalizedOut, JSON.stringify(normalized, null, 2), "utf8"),
  writeFile(paths.conflictsOut, JSON.stringify(conflicts, null, 2), "utf8"),
  writeFile(paths.planOut, JSON.stringify(plan, null, 2), "utf8"),
]);

console.log(JSON.stringify({
  normalizedOut: paths.normalizedOut,
  conflictsOut: paths.conflictsOut,
  planOut: paths.planOut,
  currentRows: plan.currentRows,
  currentUsableRows: plan.currentUsableRows,
  currentUniquePhones: plan.currentUniquePhones,
  currentConflictPhones: plan.currentConflictPhones,
  knownGhlPhones: plan.knownGhlPhones,
  candidateCount: plan.candidateCount,
  reasonCounts,
  sample: candidates.slice(0, 15),
}, null, 2));
