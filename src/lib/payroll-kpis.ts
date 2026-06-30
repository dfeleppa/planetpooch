import { PayrollCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYROLL_BUSINESS } from "@/lib/payroll";
import { toWeekParam } from "@/lib/week";

export async function getResortStaffHoursByWeek(
  weekStarts: readonly Date[]
): Promise<Map<string, number>> {
  const uniqueWeekStarts = Array.from(
    new Map(weekStarts.map((weekStart) => [toWeekParam(weekStart), weekStart])).values()
  );

  if (uniqueWeekStarts.length === 0) return new Map();

  const payrollWeeks = await prisma.financePayrollWeek.findMany({
    where: {
      business: DEFAULT_PAYROLL_BUSINESS,
      weekStart: { in: uniqueWeekStarts },
    },
    select: {
      weekStart: true,
      rows: {
        where: { category: PayrollCategory.RESORT },
        select: { totalSeconds: true },
      },
    },
  });

  const hoursByWeek = new Map<string, number>();
  for (const payrollWeek of payrollWeeks) {
    const totalSeconds = payrollWeek.rows.reduce(
      (sum, row) => sum + row.totalSeconds,
      0
    );
    hoursByWeek.set(toWeekParam(payrollWeek.weekStart), Math.round(totalSeconds / 36));
  }

  return hoursByWeek;
}
