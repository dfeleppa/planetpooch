import { normalizeEmployeeName } from "./payroll";

/** Replace every successfully pulled employee, including employees with zero appointments. */
export function replacePulledMobileEntries<T extends { employeeName: string }>(
  saved: T[],
  imported: T[],
  staffNames: string[] = []
): T[] {
  const key = (name: string) => normalizeEmployeeName(name).toLocaleLowerCase();
  const pulled = new Set([...staffNames, ...imported.map((entry) => entry.employeeName)].map(key));
  return [...saved.filter((entry) => !pulled.has(key(entry.employeeName))), ...imported];
}
