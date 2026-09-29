import { MAX_VAN_DOCUMENT_BYTES } from "@/lib/van-document-size";

async function jpegBytes(file: File, maxDimension: number, quality: number): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the scanned pages.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error("Could not compress the scanned pages.")),
      "image/jpeg", quality,
    ));
    return blob.arrayBuffer();
  } finally { bitmap.close(); }
}

/** Join image pages in their displayed order without sending them to another service. */
export async function combineVanImagePages(files: File[], outputName: string): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  for (const compression of [null, { maxDimension: 3000, quality: 0.88 }, { maxDimension: 2400, quality: 0.78 }]) {
    const pdf = await PDFDocument.create();
    for (const file of files) {
      const bytes = compression || file.type === "image/webp"
        ? await jpegBytes(file, compression?.maxDimension ?? 3000, compression?.quality ?? 0.88)
        : await file.arrayBuffer();
      const image = !compression && file.type === "image/png"
        ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([612, 792]);
      const scale = Math.min(576 / image.width, 756 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: (612 - width) / 2, y: (792 - height) / 2, width, height });
    }
    const bytes = await pdf.save();
    if (bytes.length <= MAX_VAN_DOCUMENT_BYTES)
      return new File([new Uint8Array(bytes)], outputName, { type: "application/pdf" });
  }
  throw new Error("These pages are too large together. Choose fewer pages or smaller images.");
}
