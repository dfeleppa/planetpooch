export const MAX_CAMPAIGN_CSV_BYTES = 4_000_000;
export const MAX_LSA_CSV_BYTES = 2_000_000;

/** Shared by the form and route so oversized exports never reach the hosting limit. */
export function csvUploadError(file: Pick<File, "name" | "size">, maxBytes: number): string | null {
  if (!/\.csv$/i.test(file.name)) return "Choose a CSV file (.csv).";
  if (!file.size) return "This CSV file is empty. Choose an export containing data.";
  if (file.size > maxBytes) return `CSV file must be ${maxBytes / 1_000_000} MB or smaller. Export a shorter date range and try again.`;
  return null;
}
