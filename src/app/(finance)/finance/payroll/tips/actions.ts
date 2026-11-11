"use server";

import { revalidatePath } from "next/cache";
import { Company, Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { allocateTipCents } from "@/lib/resort-tips";
import { designatedTipEmployeeIds } from "./designated-employees";

const tipIdPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

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
    where: { company: Company.RESORT, role: { not: "FRONT_DESK" }, terminatedAt: null, id: { notIn: designatedTipEmployeeIds } },
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

export async function saveDesignatedTip(input: {
  tipId?: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  paidDate: string;
  amount: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company !== "RESORT") return { ok: false, error: "Select Resort to save tips." };
  const { employeeId, tipId } = input;
  if (!designatedTipEmployeeIds.includes(employeeId)) return { ok: false, error: "Select a designated tip employee." };
  if (tipId !== undefined && !tipIdPattern.test(tipId)) {
    return { ok: false, error: "Select a valid tip record." };
  }

  const periodStart = dateOnly(input.periodStart);
  const periodEnd = dateOnly(input.periodEnd);
  const paidDate = dateOnly(input.paidDate);
  if (!periodStart || !periodEnd || !paidDate || periodEnd < periodStart) {
    return { ok: false, error: "Enter a valid pay period and paid date. The end date must be on or after the start date." };
  }
  const amountCents = Math.round(Number(input.amount) * 100);
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) {
    return { ok: false, error: "Enter a valid tip amount greater than zero." };
  }

  try {
    const error = await prisma.$transaction(async (tx) => {
      const overlap = await tx.financeResortDesignatedTip.findFirst({
        where: {
          employeeId,
          ...(tipId ? { id: { not: tipId } } : {}),
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        select: { id: true },
      });
      if (overlap) return "This pay period overlaps a saved tip for this employee.";
      const data = { periodStart, periodEnd, paidDate, amountCents };
      if (tipId) {
        const { count } = await tx.financeResortDesignatedTip.updateMany({ where: { id: tipId, employeeId }, data });
        if (!count) return "This tip record is no longer available for this employee.";
      } else {
        await tx.financeResortDesignatedTip.create({ data: { employeeId, ...data } });
      }
      return null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (error) return { ok: false, error };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return { ok: false, error: "Tip records changed while saving. Review the pay period and try again." };
    }
    console.error("Failed to save designated Resort tip", error);
    return { ok: false, error: "Could not save the tip record. Please try again." };
  }
  revalidatePath("/finance/payroll/tips");
  return { ok: true };
}

export async function deleteDesignatedTip(input: {
  employeeId: string;
  tipId: string;
  periodStart: string;
  periodEnd: string;
  paidDate: string;
  amountCents: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company !== "RESORT") return { ok: false, error: "Select Resort to delete tips." };
  const { employeeId, tipId, amountCents } = input;
  const periodStart = dateOnly(input.periodStart);
  const periodEnd = dateOnly(input.periodEnd);
  const paidDate = dateOnly(input.paidDate);
  if (!designatedTipEmployeeIds.includes(employeeId) || !tipIdPattern.test(tipId) ||
      !periodStart || !periodEnd || !paidDate || !Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) {
    return { ok: false, error: "Select a valid tip record." };
  }

  try {
    const { count } = await prisma.financeResortDesignatedTip.deleteMany({
      where: { id: tipId, employeeId, periodStart, periodEnd, paidDate, amountCents },
    });
    revalidatePath("/finance/payroll/tips");
    if (!count) return { ok: false, error: "This tip was changed or removed. Review the updated history." };
    return { ok: true };
  } catch (error) {
    console.error("Failed to delete designated Resort tip", error);
    return { ok: false, error: "Could not delete the tip record. Please try again." };
  }
}
