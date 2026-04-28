import type { EmployeeDocumentCategory } from "@prisma/client";

/** Human-readable label for each category. Also used as the Drive file name. */
export const DOCUMENT_CATEGORY_LABELS: Record<EmployeeDocumentCategory, string> = {
  I9: "I-9 Form",
  ID_CARD: "ID Card",
  SS_CARD: "Social Security Card",
  OTHER: "Other",
};

/** All valid categories the upload form may submit. */
export const DOCUMENT_CATEGORIES: EmployeeDocumentCategory[] = [
  "I9",
  "ID_CARD",
  "SS_CARD",
  "OTHER",
];

/**
 * Categories an employee is expected to have on file. Used by both the
 * employee detail page (DocumentsCard "X missing" state) and the roster
 * column on /admin/employees ("X/3"). OTHER is intentionally excluded —
 * it's a catch-all, not a checklist item.
 */
export const REQUIRED_DOCUMENT_CATEGORIES: EmployeeDocumentCategory[] = [
  "I9",
  "ID_CARD",
  "SS_CARD",
];

export function isValidCategory(value: unknown): value is EmployeeDocumentCategory {
  return typeof value === "string" && (DOCUMENT_CATEGORIES as string[]).includes(value);
}

/**
 * The file name we save into Drive. For preset categories we use the label
 * (e.g. "I-9 Form.pdf"); for OTHER, we use the admin's custom name. The
 * extension is taken from the original upload so Drive opens it correctly.
 */
export function buildDriveFileName(
  category: EmployeeDocumentCategory,
  customName: string | null,
  originalFileName: string
): string {
  const ext = extractExtension(originalFileName);
  const base = category === "OTHER"
    ? (customName?.trim() || "Document")
    : DOCUMENT_CATEGORY_LABELS[category];
  return ext ? `${base}.${ext}` : base;
}

function extractExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1 || idx === name.length - 1) return "";
  return name.slice(idx + 1);
}

/** Files we accept. Roughly: PDFs and common image formats for ID scans. */
export const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/** 10 MB. Vercel's Node serverless body limit is ~4.5 MB on Pro by default,
 *  so anything close to this may need a body-size override or the Vercel Blob
 *  direct-upload pattern. For phone-scanned IDs and PDF forms, 10 MB is well
 *  under the typical file size, so this mostly serves as a sanity guard. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
