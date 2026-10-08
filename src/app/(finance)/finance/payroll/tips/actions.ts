"use server";

import { revalidatePath } from "next/cache";
import { Company } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { allocateTipCents } from "@/lib/resort-tips";

type Input = {
  payDate: string;
  periodStart: string;
  periodEnd: string;
  totalTips: string;
  hours: { employeeId: string; hours: string }[];
};

function dateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export async function saveResortTips(input: Input): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company !== "RESORT") return { ok: false, error: "Select Resort to save tips." };

  const payDate = dateOnly(input.payDate);
  const periodStart = dateOnly(input.periodStart);
  const periodEnd = dateOnly(input.periodEnd);
  if (!payDate || !periodStart || !periodEnd || periodStart > periodEnd) {
    return { ok: false, error: "Enter a valid pay date and pay period." };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(input.totalTips)) return { ok: false, error: "Enter a valid total tips amount." };
  const totalCents = Math.round(Number(input.totalTips) * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 2_147_483_647) return { ok: false, error: "Enter a valid tip total greater than zero." };

  const employees = await prisma.user.findMany({
    where: { company: Company.RESORT, terminatedAt: null },
    select: { id: true, name: true },
  });
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  if (input.hours.length !== employees.length || new Set(input.hours.map((row) => row.employeeId)).size !== employees.length ||
      input.hours.some((row) => !byId.has(row.employeeId) || !/^\d+(\.\d{1,2})?$/.test(row.hours))) {
    return { ok: false, error: "The employee list or hours changed. Refresh and review the calculation." };
  }
  const hours = input.hours.map((row) => ({ employeeId: row.employeeId, hoursHundredths: Math.round(Number(row.hours) * 100) }));
  if (hours.some((row) => !Number.isSafeInteger(row.hoursHundredths) || row.hoursHundredths > 2_147_483_647)) return { ok: false, error: "Enter valid hours worked." };

  let allocations: ReturnType<typeof allocateTipCents>;
  try { allocations = allocateTipCents(totalCents, hours); }
  catch { return { ok: false, error: "Enter hours for at least one employee." }; }

  try {
    await prisma.financeResortTipRun.create({
      data: {
        payDate, periodStart, periodEnd, totalCents,
        allocations: { create: allocations.filter((row) => row.hoursHundredths > 0).map((row) => ({
          employeeId: row.employeeId,
          employeeName: byId.get(row.employeeId)!.name,
          hoursHundredths: row.hoursHundredths,
          amountCents: row.amountCents,
        })) },
      },
    });
  } catch (error) {
    console.error("Failed to save Resort tips", error);
    return { ok: false, error: "Could not save the tip record. Please try again." };
  }
  revalidatePath("/finance/payroll/tips");
  return { ok: true };
}
