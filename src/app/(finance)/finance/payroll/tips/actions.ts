"use server";

import { revalidatePath } from "next/cache";
import { Company, Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { allocateTipCents } from "@/lib/resort-tips";

type Input = {
  payDate: string;
  year: string;
  month: string;
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
  if (!payDate || !/^\d{4}$/.test(input.year) || !/^(0[1-9]|1[0-2])$/.test(input.month)) {
    return { ok: false, error: "Enter a valid pay date, year, and month." };
  }
  const year = Number(input.year);
  if (year < 2010 || year > new Date().getUTCFullYear() + 1) return { ok: false, error: "Select a valid year." };
  const month = Number(input.month);
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0));
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A tip entry already exists for this month." };
    }
    console.error("Failed to save Resort tips", error);
    return { ok: false, error: "Could not save the tip record. Please try again." };
  }
  revalidatePath("/finance/payroll/tips");
  return { ok: true };
}
