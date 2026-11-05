import { parseSchedule, type SchedulePage } from "./schedule-formatter";

export async function readSchedulePdf(file: File, progress: (message: string) => void = () => {}) {
  if (!file.size) throw new Error("This file is empty. Choose another PDF.");
  if (!/\.pdf$/i.test(file.name)) throw new Error("Choose an ADP Team Schedule PDF.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a PDF smaller than 10 MB.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/schedule-pdf.worker-5.4.624.min.mjs";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 10) throw new Error("Upload one weekly schedule, with at most 10 pages.");
    const pages: SchedulePage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ width: viewport.width, height: viewport.height, items: content.items.flatMap(item => "str" in item ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }] : []) });
      page.cleanup();
    }
    if (pages.some(page => !page.items.some(item => /[a-z]{3}/i.test(item.text)))) {
      const { readScheduleImage } = await import("./read-schedule-image");
      return await readScheduleImage(pdf, progress);
    }
    return parseSchedule(pages);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("This PDF is password protected. Upload an unlocked copy.");
    throw error;
  } finally { await task.destroy(); }
}
