import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { clockLabel, coverageGroups, coverageRows, employeeLabels, type WeeklySchedule } from "./schedule-formatter";

function printable(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of printable(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > width && line) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export async function buildSchedulePdf(schedule: WeeklySchedule): Promise<Uint8Array> {
  const rows = coverageRows(schedule.shifts);
  if (!rows.length) throw new Error("Add at least one working shift before downloading.");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const labels = employeeLabels(schedule.shifts);
  const names = [...labels.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // Keep one landscape page without reducing text below a readable minimum.
  const formats = [[792, 612], [1008, 612], [1224, 792]];
  const size = 7;
  const leading = 8;
  const coverage = rows.map(row => coverageGroups(row, schedule.days));
  function fitRow(days: typeof coverage[number], dayWidth: number) {
    const cells = days.map(groups => groups.map(({ employees }) => ({
      lines: wrap(employees.map(name => labels.get(name) ?? name).join(", ") || "-", regular, size, dayWidth - 25),
      count: String(employees.length),
    })));
    const split = cells.filter(groups => groups.length === 2);
    const bandHeight = (lines: string[]) => lines.length * leading + 4;
    const topHeight = Math.max(12, ...split.map(groups => bandHeight(groups[0].lines)));
    const bottomHeight = Math.max(12, ...split.map(groups => bandHeight(groups[1].lines)));
    const height = Math.max(split.length ? topHeight + bottomHeight : 16,
      ...cells.filter(groups => groups.length === 1).map(groups => bandHeight(groups[0].lines)));
    return { cells, topHeight, height };
  }
  let layout: { width: number; height: number; dayWidth: number; fitted: ReturnType<typeof fitRow>[]; legend: string[] } | undefined;
  for (const [width, height] of formats) {
    const dayWidth = (width - 48 - 91) / 7;
    const fitted = coverage.map(days => fitRow(days, dayWidth));
    const legend = wrap(names.map(([full, short]) => `${short} = ${full}`).join("; "), regular, 6.5, width - 48);
    if (fitted.reduce((sum, row) => sum + row.height, 0) + legend.length * 8 + 116 <= height - 48) {
      layout = { width, height, dayWidth, fitted, legend }; break;
    }
  }
  if (!layout) throw new Error("This schedule has too much detail for one readable landscape page. Reduce the schedule to one week or fewer shifts.");
  const { width, height, dayWidth, fitted, legend } = layout;
  const page = pdf.addPage([width, height]);
  const ink = rgb(0.12, 0.18, 0.2), line = rgb(0.76, 0.79, 0.8);
  const text = (value: string, x: number, y: number, font = regular, fontSize = size) => page.drawText(printable(value), { x, y, size: fontSize, font, color: ink });
  text("PLANET POOCH | PET RESORT STAFFING", 24, height - 34, bold, 15);
  text(schedule.title || "Weekly schedule", 24, height - 49, regular, 10);
  text("Mon-Sat, 7:30 AM to 7:00 PM: Management above the divider, staff below. Each count is for that group.", 24, height - 62, regular, 8);
  let y = height - 76;
  page.drawRectangle({ x: 24, y: y - 23, width: width - 48, height: 23, color: rgb(0.87, 0.92, 0.89) });
  text("Time", 29, y - 15, bold, 8);
  schedule.days.forEach((day, index) => { text(day, 24 + 91 + index * dayWidth + 4, y - 10, bold, 8); text("Employees / count", 24 + 91 + index * dayWidth + 4, y - 19, regular, 6); });
  y -= 23;
  rows.forEach((row, index) => {
    const { cells, topHeight, height: rowHeight } = fitted[index];
    const bottom = y - rowHeight;
    if (index % 2 === 0) page.drawRectangle({ x: 24, y: bottom, width: width - 48, height: rowHeight, color: rgb(0.96, 0.97, 0.97) });
    text(`${clockLabel(row.start)} - ${clockLabel(row.end)}`, 29, y - rowHeight / 2 - 2, regular, 7);
    for (let day = 0; day < 7; day++) {
      const x = 24 + 91 + day * dayWidth;
      const groups = cells[day];
      groups.forEach(({ lines, count }, band) => {
        const top = band === 0 ? y : y - topHeight;
        const base = groups.length === 2 && band === 0 ? y - topHeight : bottom;
        if (band === 1) page.drawLine({ start: { x, y: top }, end: { x: x + dayWidth, y: top }, thickness: 0.35, color: line });
        lines.forEach((value, i) => text(value, x + 4, top - 9 - i * leading));
        text(count, x + dayWidth - 6 - bold.widthOfTextAtSize(count, 9), (top + base) / 2 - 3, bold, 9);
      });
      page.drawLine({ start: { x, y }, end: { x, y: bottom }, thickness: 0.35, color: line });
    }
    page.drawLine({ start: { x: 24, y: bottom }, end: { x: width - 24, y: bottom }, thickness: 0.35, color: line });
    y = bottom;
  });
  y -= 13;
  text(`${schedule.shifts.length} shifts | ${(schedule.shifts.reduce((sum, shift) => sum + shift.end - shift.start, 0) / 60).toFixed(2)} scheduled labor hours | Times preserved from reviewed shifts`, 24, y, bold, 8);
  y -= 13;
  legend.forEach(value => { text(value, 24, y, regular, 6.5); y -= 8; });
  text(`${width === 792 ? "Letter" : width === 1008 ? "Legal" : "Tabloid"} landscape | 1 page`, width - 175, 15, regular, 7);
  pdf.setTitle("Planet Pooch weekly staffing schedule");
  return pdf.save();
}
