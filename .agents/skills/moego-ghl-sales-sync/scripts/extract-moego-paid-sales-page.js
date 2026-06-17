(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const phoneRegex = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
  const moneyRegex = /\$?\s*-?\d[\d,]*(?:\.\d{2})?/;
  const parseMoney = (value) => {
    const text = clean(value);
    const match = text.match(moneyRegex);
    if (!match) return null;
    const number = Number(match[0].replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  };

  const headers = Array.from(document.querySelectorAll("thead th, [role='columnheader']"))
    .filter(visible)
    .map((cell) => clean(cell.innerText || cell.textContent))
    .filter(Boolean);

  const lowerHeaders = headers.map((header) => header.toLowerCase());
  const headerIndex = (patterns) => lowerHeaders.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  const nameIndex = headerIndex([/name/, /client/, /customer/]);
  const phoneIndex = headerIndex([/phone/, /mobile/, /cell/]);
  const paidIndex = headerIndex([/total.*paid/, /paid/, /amount/, /sales/, /payment/]);

  const rowCandidates = Array.from(document.querySelectorAll("tbody tr, .ant-table-row, [role='row']"))
    .filter(visible)
    .filter((row) => !row.closest("thead"));

  const seenNode = new Set();
  const tableRows = [];
  for (const row of rowCandidates) {
    if (seenNode.has(row)) continue;
    seenNode.add(row);

    const cells = Array.from(row.querySelectorAll("td, [role='cell'], .ant-table-cell"))
      .filter(visible)
      .map((cell) => clean(cell.innerText || cell.textContent))
      .filter(Boolean);
    if (cells.length < 2) continue;

    const phoneCellIndex = phoneIndex >= 0 ? phoneIndex : cells.findIndex((cell) => phoneRegex.test(cell));
    const paidCellIndex = paidIndex >= 0 ? paidIndex : cells.map(parseMoney).findIndex((value) => value !== null);
    const candidateNameIndex = nameIndex >= 0 ? nameIndex : cells.findIndex((cell, index) => {
      return index !== phoneCellIndex && index !== paidCellIndex && !phoneRegex.test(cell) && parseMoney(cell) === null;
    });

    const phone = phoneCellIndex >= 0 ? (cells[phoneCellIndex].match(phoneRegex) || [cells[phoneCellIndex]])[0] : "";
    const totalPaidNumber = paidCellIndex >= 0 ? parseMoney(cells[paidCellIndex]) : null;
    const totalPaid = totalPaidNumber === null ? "" : `$${totalPaidNumber.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const name = candidateNameIndex >= 0 ? cells[candidateNameIndex] : "";

    if (name && phone && totalPaidNumber !== null) {
      tableRows.push({ name, phone, totalPaid, totalPaidNumber, cells });
    }
  }

  const fallbackRows = [];
  if (tableRows.length === 0) {
    const lines = clean(document.body.innerText || "").split(/(?<=\d{4})\s+/);
    for (const line of lines) {
      const phoneMatch = line.match(phoneRegex);
      const moneyMatches = line.match(new RegExp(moneyRegex.source, "g")) || [];
      if (!phoneMatch || moneyMatches.length === 0) continue;
      const phone = phoneMatch[0];
      const totalPaidNumber = parseMoney(moneyMatches[moneyMatches.length - 1]);
      const name = clean(line.slice(0, phoneMatch.index)).replace(/^(name|client)\s*/i, "");
      if (name && totalPaidNumber !== null) {
        fallbackRows.push({
          name,
          phone,
          totalPaid: `$${totalPaidNumber.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          totalPaidNumber,
          sourceText: line,
        });
      }
    }
  }

  const rows = tableRows.length ? tableRows : fallbackRows;
  const bodyText = clean(document.body.innerText || "");
  const pageSizeText = (bodyText.match(/\b\d+\s*\/\s*page\b/i) || [null])[0];
  const warnings = [];

  if (!/paid/i.test(bodyText)) warnings.push("The page text does not clearly show a paid view.");
  if (rows.length === 0) warnings.push("No MoeGo paid rows were extracted from the visible page.");
  if (!pageSizeText) warnings.push("Could not detect the table page-size label.");

  return {
    extractedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    headers,
    pageSizeText,
    rows,
    rowCount: rows.length,
    warnings,
  };
})();
