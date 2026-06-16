export const PAYROLL_CATEGORIES = ["TRAINING", "GROOMING", "RESORT"] as const;

export type PayrollCategoryValue = (typeof PAYROLL_CATEGORIES)[number];

export const PAYROLL_CATEGORY_LABELS: Record<PayrollCategoryValue, string> = {
  TRAINING: "Training",
  GROOMING: "Grooming",
  RESORT: "Resort",
};

const CATEGORY_BY_EMPLOYEE: Record<string, PayrollCategoryValue> = {
  "rebecca cooperstein": "TRAINING",
  "gabriela sanchez": "GROOMING",
};

export function normalizeEmployeeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function categoryForEmployee(name: string): PayrollCategoryValue {
  return CATEGORY_BY_EMPLOYEE[normalizeEmployeeName(name).toLocaleLowerCase()] ?? "RESORT";
}

export function formatPayrollDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  let remaining = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - minutes * 60;
  return `${sign}${hours}h ${minutes}mins ${seconds}secs`;
}

export function decimalPayrollHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

export function parsePayrollDurationToSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const raw = String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
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
  if (!h && !m && !s) return null;

  return Math.max(
    0,
    Math.round(
      (h ? Number(h[1]) * 3600 : 0) +
        (m ? Number(m[1]) * 60 : 0) +
        (s ? Number(s[1]) : 0)
    )
  );
}
