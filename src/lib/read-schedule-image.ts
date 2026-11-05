import type { PDFDocumentProxy } from "pdfjs-dist";
import { createWorker, PSM } from "tesseract.js";
import { clockLabel, parseClock, validateShifts, type WeeklySchedule } from "./schedule-formatter";
import { scheduleCalendar, scheduleWeekStart } from "./schedule-storage";
import { hasScheduleInk, scheduleImageGrid } from "./schedule-image-grid";

const WEEK = /Week\s+of\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})\s*[-–—]\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i;
const RANGE = /(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AP]M)/gi;

function employeeName(text: string): string {
  const lines = text.trim().split(/\n+/).map(line => line.trim()).filter(Boolean);
  let name = lines[0] || "";
  for (const part of lines.slice(1)) name += name.endsWith(",") || /^[A-Z]$/.test(part) ? ` ${part}` : part;
  return name.replace(/([a-z])([A-Z])(?=\s|$)/g, "$1 $2");
}

/** Read each printed table cell separately so narrow, wrapped ADP printouts keep their rows and days. */
export async function readScheduleImage(pdf: PDFDocumentProxy, progress: (message: string) => void): Promise<WeeklySchedule> {
  const base = `${window.location.origin}/api/operations/schedule-ocr`;
  progress("Preparing image reading…");
  const worker = await createWorker("eng", 1, { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base, workerBlobURL: false });
  const schedule: WeeklySchedule = { title: "", days: [], shifts: [], warnings: ["This PDF contains images. Review the extracted names and shift times against the printout before using the schedule."] };
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    for (let number = 1; number <= pdf.numPages; number++) {
      progress(`Reading schedule image · page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const view = page.getViewport({ scale: 3 });
      const canvas = document.createElement("canvas"); canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Your browser could not read the schedule image.");
      await page.render({ canvas, canvasContext: context, viewport: view }).promise;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const grid = scheduleImageGrid(image);
      if (!grid) {
        // Browser printing can append a footer-only page. Skip it only when the body is actually empty.
        if (!hasScheduleInk(image, 0, image.height * 0.1, image.width, image.height * 0.9)) { page.cleanup(); continue; }
        throw new Error(`The schedule table on page ${number} could not be located. Try printing the ADP schedule with its table borders visible.`);
      }
      async function recognize(left: number, top: number, right: number, bottom: number) {
        const crop = document.createElement("canvas");
        crop.width = Math.ceil(right - left) + 20; crop.height = Math.ceil(bottom - top) + 20;
        const ctx = crop.getContext("2d")!;
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, crop.width, crop.height);
        ctx.drawImage(canvas, left, top, right - left, bottom - top, 10, 10, right - left, bottom - top);
        const result = await worker.recognize(crop);
        return result.data;
      }
      if (grid.rows[0] > image.height * 0.07) {
        const header = await recognize(grid.columns[0], Math.floor(image.height * 0.07), grid.columns[8], grid.rows[0] - 4);
        const week = WEEK.exec(header.text.replace(/\n/g, " "));
        if (week) {
          const title = `Week of ${week[1]} - ${week[2]}`.replace(/\s+/g, " ");
          if (schedule.title && schedule.title !== title) throw new Error("This PDF contains different weeks. Upload one week at a time.");
          schedule.title = title; schedule.days = scheduleCalendar(title).days;
        }
      }
      if (!schedule.title) throw new Error("The printed week dates could not be read clearly. Try a higher-quality PDF print.");
      let recognizedDays = 0;
      for (let day = 0; day < 7; day++) {
        const data = await recognize(grid.columns[day + 1] + 5, grid.rows[0] + 5, grid.columns[day + 2] - 5, grid.rows[1] - 5);
        if (data.text.trim().slice(0, 3).toLowerCase() === schedule.days[day].slice(0, 3).toLowerCase()) recognizedDays++;
        const printedDate = data.text.trim().match(/\d+/)?.[0];
        if (printedDate && +printedDate !== +schedule.days[day].split(" ")[1]) throw new Error(`The day headings on page ${number} do not match the printed week dates. Check that the PDF contains only one week.`);
      }
      if (recognizedDays < 4) throw new Error(`The day headings on page ${number} could not be read clearly. Try a higher-quality PDF print.`);
      for (let row = 1; row < grid.rows.length - 1; row++) {
        progress(`Reading schedule image · page ${number} of ${pdf.numPages} · employee ${row} of ${grid.rows.length - 2}…`);
        const top = grid.rows[row] + 6, bottom = grid.rows[row + 1] - 6;
        const nameData = await recognize(grid.columns[0] + 6, top, grid.columns[1] - 6, bottom);
        const employee = employeeName(nameData.text);
        if (!employee.includes(",") || !employee.split(",")[1].trim()) throw new Error(`An employee name on page ${number}, row ${row} could not be read clearly. Try a higher-quality PDF print.`);
        if (nameData.confidence < 70) schedule.warnings.push(`Check the employee name "${employee}" on page ${number}.`);
        for (let day = 0; day < 7; day++) {
          const left = grid.columns[day + 1] + 6, right = grid.columns[day + 2] - 6;
          if (!hasScheduleInk(image, left, top, right, bottom)) continue;
          const data = await recognize(left, top, right, bottom);
          const text = data.text.replace(/\s+/g, " ").trim();
          const matches = [...text.matchAll(RANGE)];
          const leftover = text.replace(RANGE, "").trim();
          if (!matches.length || leftover) throw new Error(`The shift for ${employee}, ${schedule.days[day]} on page ${number} could not be read clearly (${text || "unreadable text"}). Try a higher-quality PDF print.`);
          for (const [index, match] of matches.entries()) {
            const start = parseClock(match[1]); let end = parseClock(match[2]); if (end < start) end += 1440;
            schedule.shifts.push({ id: `image-${number}-${row}-${day}-${index}`, employee, day, start, end });
            if (start % 30 || end % 30) schedule.warnings.push(`${employee}, ${schedule.days[day]}: ${clockLabel(start)} - ${clockLabel(end)} is not on the half hour. The exact time is preserved.`);
          }
          if (data.confidence < 70) schedule.warnings.push(`Check the shift for ${employee}, ${schedule.days[day]} against the printout.`);
        }
      }
      page.cleanup(); canvas.width = 0; canvas.height = 0;
    }
    if (!schedule.shifts.length) throw new Error("No working shifts were found in this printout.");
    validateShifts(schedule.shifts); scheduleWeekStart(schedule);
    return schedule;
  } finally { await worker.terminate(); }
}
