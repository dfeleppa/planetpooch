// Anderson owns the business and is not processed through employee payroll.
// Match explicit source names only; do not exclude other employees by role or surname.
export const PAYROLL_EXCLUDED_USER_IDS = ["cmobzlipg0001lb04a2g895d0"];
const EXCLUDED_NAMES = ["anderson", "anderson gonzaga", "gonzaga anderson"];

export function isPayrollEmployee(name: string): boolean {
  const key = name.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return !EXCLUDED_NAMES.includes(key);
}

export function payrollEligibleRows<T extends { employeeName: string }>(rows: T[]): T[] {
  return rows.filter((row) => isPayrollEmployee(row.employeeName));
}

// For database projections that omit the employee name (totals and counts).
export const payrollEmployeeWhere = {
  NOT: {
    OR: [...EXCLUDED_NAMES, "gonzaga, anderson"].map((name) => ({
      employeeName: { equals: name, mode: "insensitive" as const },
    })),
  },
};
