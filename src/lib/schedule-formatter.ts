export type ScheduleText = { text: string; x: number; y: number; width: number; height: number };
export type SchedulePage = { items: ScheduleText[]; width: number; height: number };
export type ScheduleShift = { id: string; employee: string; day: number; start: number; end: number };
export type WeeklySchedule = { title: string; days: string[]; shifts: ScheduleShift[]; warnings: string[] };
export type CoverageRow = { start: number; end: number; employees: string[][] };

const DAY = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:day)?\s+\d{1,2}$/i;
const RANGE = /(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AP]M)/gi;

export function parseClock(text: string): number {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(text.trim());
  if (!match || +match[1] < 1 || +match[1] > 12 || +match[2] > 59) throw new Error(`Invalid time: ${text}`);
  return (+match[1] % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + +match[2];
}

export function clockLabel(minutes: number): string {
  const time = minutes % 1440;
  const hour = Math.floor(time / 60);
  return `${hour % 12 || 12}:${String(time % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}${minutes >= 1440 ? " +1d" : ""}`;
}

export function inputTime(minutes: number): string {
  return `${String(Math.floor(minutes % 1440 / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Read ADP's employee-by-day grid by position, preserving blank cells and wrapped names. */
export function parseSchedule(pages: SchedulePage[]): WeeklySchedule {
  if (!pages.length || pages.length > 10) throw new Error("Choose a schedule PDF with 1 to 10 pages.");
  const result: WeeklySchedule = { title: "", days: [], shifts: [], warnings: [] };
  for (const [pageIndex, page] of pages.entries()) {
    const items = page.items.filter(item => item.text.trim()).map(item => ({ ...item, text: item.text.trim() }));
    const week = items.find(item => /^Week of\s/i.test(item.text))?.text;
    if (week) {
      if (result.title && result.title !== week) throw new Error("This PDF contains different weeks. Upload one week at a time.");
      result.title = week;
    }
    const headers = items.filter(item => DAY.test(item.text)).sort((a, b) => a.x - b.x);
    if (headers.length !== 7 || headers.some(item => Math.abs(item.y - headers[0].y) > 4)) {
      throw new Error(`Page ${pageIndex + 1} does not have a readable seven-day schedule grid. Use the original ADP Team Schedule PDF, rather than a scan.`);
    }
    const days = headers.map(item => item.text);
    if (result.days.length && days.join("|") !== result.days.join("|")) throw new Error("The pages do not belong to the same weekly schedule.");
    result.days = days;
    const centers = headers.map(item => item.x + item.width / 2);
    const step = (centers[6] - centers[0]) / 6;
    const left = centers[0] - step / 2;
    const top = headers[0].y;
    const names = items.filter(item => item.x < left && item.y < top - 4 && item.y > 30 && item.text.includes(","))
      .sort((a, b) => b.y - a.y);
    if (!names.length) throw new Error(`Employee names could not be read on page ${pageIndex + 1}. Use the original ADP PDF.`);
    for (const [index, name] of names.entries()) {
      const bottom = names[index + 1]?.y ?? 30;
      const parts = items.filter(item => item.x < left && item.y <= name.y + 2 && item.y > bottom + 2)
        .sort((a, b) => b.y - a.y || a.x - b.x);
      let employee = parts[0]?.text ?? name.text;
      for (const part of parts.slice(1)) employee += part.text.length <= 1 ? ` ${part.text}` : part.text;
      // A shift is usually aligned just above the name's baseline.
      for (let day = 0; day < 7; day++) {
        const cell = items.filter(item => item.x >= left + step * day && item.x < left + step * (day + 1)
          && item.y <= name.y + 5 && item.y > bottom + 5).sort((a, b) => b.y - a.y || a.x - b.x);
        const text = cell.map(item => item.text).join(" ");
        const matches = [...text.matchAll(RANGE)];
        const leftover = text.replace(RANGE, "").trim();
        if (leftover && /\d\s*:|\b[AP]M\b/i.test(leftover)) throw new Error(`Could not read a shift for ${employee}, ${days[day]}. Check the source PDF.`);
        if (leftover) result.warnings.push(`${employee}, ${days[day]}: skipped non-shift text "${leftover}".`);
        for (const match of matches) {
          const start = parseClock(match[1]);
          let end = parseClock(match[2]);
          if (end === start) throw new Error(`Start and end are the same for ${employee}, ${days[day]}.`);
          if (end < start) end += 1440;
          result.shifts.push({ id: `${pageIndex}-${index}-${day}-${match.index}`, employee, day, start, end });
          if (start % 30 || end % 30) result.warnings.push(`${employee}, ${days[day]}: ${clockLabel(start)} - ${clockLabel(end)} is not on the half hour. The exact time is preserved.`);
        }
      }
    }
    const footer = items.find(item => item.y < 30 && /^\d+\s*\/\s*\d+$/.test(item.text));
    if (footer && +footer.text.split("/")[1] > pages.length) result.warnings.push("The printed page count suggests this PDF may be incomplete. Confirm that all working employees are included.");
  }
  if (!result.shifts.length) throw new Error("No working shifts were found. Choose the original ADP Team Schedule PDF.");
  validateShifts(result.shifts);
  result.warnings = [...new Set(result.warnings)];
  return result;
}

export function validateShifts(shifts: ScheduleShift[]): void {
  for (const shift of shifts) {
    if (!shift.employee.trim() || !Number.isInteger(shift.day) || shift.day < 0 || shift.day > 6 ||
      !Number.isInteger(shift.start) || !Number.isInteger(shift.end) || shift.start < 0 || shift.start >= 1440 ||
      shift.end <= shift.start || shift.end > shift.start + 1440) throw new Error("Each shift needs a name, day, and valid start/end times.");
  }
  if (shifts.some(shift => shift.day === 6 && shift.end > 1440)) throw new Error("A Saturday shift runs into the next week. Split it into separate weekly schedules before formatting.");
  const key = (shift: ScheduleShift) => shift.employee.trim().toLowerCase();
  const sorted = [...shifts].sort((a, b) => key(a).localeCompare(key(b)) || (a.day * 1440 + a.start) - (b.day * 1440 + b.start));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (key(a) === key(b) && b.day * 1440 + b.start < a.day * 1440 + a.end) {
      throw new Error(`Overlapping or duplicate shifts for ${b.employee}. Correct them before downloading.`);
    }
  }
}

/** Each cell counts unique employees on duty for the entire interval; shift ends are exclusive. */
export function coverageRows(shifts: ScheduleShift[]): CoverageRow[] {
  if (!shifts.length) return [];
  validateShifts(shifts);
  // Overnight work belongs to the following calendar day.
  const segments = shifts.flatMap(shift => shift.end <= 1440 ? [shift] : [
    { ...shift, end: 1440 }, { ...shift, day: (shift.day + 1) % 7, start: 0, end: shift.end - 1440 },
  ]);
  const first = Math.min(...segments.map(shift => shift.start));
  const last = Math.max(...segments.map(shift => shift.end));
  const boundaries = new Set<number>([first, last]);
  for (let t = Math.ceil(first / 60) * 60; t < last; t += 60) boundaries.add(t);
  for (const shift of segments) { boundaries.add(shift.start); boundaries.add(shift.end); }
  const times = [...boundaries].sort((a, b) => a - b);
  return times.slice(0, -1).map((start, index) => ({ start, end: times[index + 1], employees: Array.from({ length: 7 }, (_, day) =>
    [...new Set(segments.filter(shift => shift.day === day && shift.start <= start && shift.end >= times[index + 1]).map(shift => shift.employee))].sort((a, b) => a.localeCompare(b))),
  }));
}

export function employeeLabels(shifts: ScheduleShift[]): Map<string, string> {
  const names = [...new Set(shifts.map(shift => shift.employee))];
  const firstNames = names.map(name => name.includes(",") ? name.split(",")[1].trim().split(/\s+/)[0] : name);
  const short = names.map(name => {
    const [last, first] = name.split(",").map(part => part.trim());
    const given = first?.split(/\s+/)[0];
    return given ? firstNames.filter(value => value === given).length === 1 ? given : `${given} ${last[0]}.` : name;
  });
  return new Map(names.map((name, index) => [name, short.filter(label => label === short[index]).length > 1 ? name : short[index]]));
}
