(() => {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseDurationToSeconds(text) {
    const raw = cleanText(text).toLowerCase();
    if (!raw) return null;

    const colon = raw.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
    if (colon) {
      const hours = Number(colon[1]);
      const minutes = Number(colon[2]);
      const seconds = Number(colon[3] || 0);
      return hours * 3600 + minutes * 60 + seconds;
    }

    const h = raw.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/);
    const m = raw.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);
    const s = raw.match(/(\d+)\s*s(?:ec(?:ond)?s?)?/);
    const hasAny = h || m || s;
    if (!hasAny) return null;

    return Math.round((h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0));
  }

  function formatSeconds(totalSeconds) {
    const sign = totalSeconds < 0 ? "-" : "";
    let remaining = Math.abs(Math.round(totalSeconds));
    const hours = Math.floor(remaining / 3600);
    remaining -= hours * 3600;
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining - minutes * 60;
    return `${sign}${hours}h ${minutes}mins ${seconds}secs`;
  }

  function moegoDateToIso(value) {
    const match = cleanText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date.toISOString().slice(0, 10);
  }

  function readRows() {
    const rows = [];
    const parseWarnings = [];
    const tableRows = Array.from(document.querySelectorAll("table tr"));

    for (const tr of tableRows) {
      const cells = Array.from(tr.querySelectorAll("td")).map((td) => cleanText(td.textContent));
      if (cells.length < 4) continue;

      const [name, date, time, totalHours] = cells;
      if (!name || !/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !totalHours) continue;

      const totalSeconds = parseDurationToSeconds(totalHours);
      if (totalSeconds == null) {
        parseWarnings.push(`Could not parse duration for ${name} on ${date}: ${totalHours}`);
        continue;
      }

      rows.push({
        name,
        date,
        time,
        totalHours,
        totalSeconds,
      });
    }

    return { rows, parseWarnings };
  }

  function summarize(rows) {
    const byEmployee = new Map();
    for (const row of rows) {
      const displayName = cleanText(row.name);
      const key = displayName.toLocaleLowerCase();
      const current = byEmployee.get(key) || {
        name: displayName,
        shifts: 0,
        totalSeconds: 0,
      };
      current.shifts += 1;
      current.totalSeconds += row.totalSeconds;
      byEmployee.set(key, current);
    }

    return Array.from(byEmployee.values())
      .map((entry) => ({
        name: entry.name,
        shifts: entry.shifts,
        totalSeconds: entry.totalSeconds,
        totalDuration: formatSeconds(entry.totalSeconds),
        decimalHours: Math.round((entry.totalSeconds / 3600) * 100) / 100,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function readDateRange() {
    return Array.from(document.querySelectorAll('input[placeholder="MM/DD/YYYY"]'))
      .map((input) => cleanText(input.value))
      .filter(Boolean)
      .slice(0, 2);
  }

  function readPageSizeText() {
    const candidates = Array.from(document.querySelectorAll("button, [role='button'], div, span"))
      .map((el) => cleanText(el.textContent))
      .filter((text) => /^\d+\s*\/\s*page$/i.test(text));
    return candidates[candidates.length - 1] || null;
  }

  const { rows, parseWarnings } = readRows();
  const dateRange = readDateRange();
  const pageSizeText = readPageSizeText();
  const totals = summarize(rows);
  const grandTotalSeconds = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
  const weekStart = moegoDateToIso(dateRange[0]);
  const weekEnd = moegoDateToIso(dateRange[1]);
  const warnings = [...parseWarnings];

  if (dateRange.length !== 2) warnings.push("Expected exactly two date inputs for the payroll week.");
  if (dateRange.length === 2 && (!weekStart || !weekEnd)) warnings.push("Could not convert the date range to ISO dates.");
  if (pageSizeText && !/^100\s*\/\s*page$/i.test(pageSizeText)) warnings.push(`Page size is ${pageSizeText}, not 100/page.`);
  if (!pageSizeText) warnings.push("Could not verify the page-size control.");
  if (rows.length === 0) warnings.push("No clock-in/out table rows were parsed.");

  return {
    generatedAt: new Date().toISOString(),
    url: window.location.href,
    dateRange,
    pageSizeText,
    rowCount: rows.length,
    rows,
    totals,
    grandTotal: {
      totalSeconds: grandTotalSeconds,
      totalDuration: formatSeconds(grandTotalSeconds),
      decimalHours: Math.round((grandTotalSeconds / 3600) * 100) / 100,
    },
    payrollUpload: weekStart && weekEnd ? {
      weekStart,
      weekEnd,
      source: "moego-clock-inout",
      notes: `Imported from MoeGo clock-in/out for ${dateRange[0]} - ${dateRange[1]}`,
      rows: totals.map((entry) => ({
        employeeName: entry.name,
        shifts: entry.shifts,
        totalSeconds: entry.totalSeconds,
      })),
    } : null,
    warnings,
  };
})()
