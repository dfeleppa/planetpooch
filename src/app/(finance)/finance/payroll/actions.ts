"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const PAYROLL_PATH = "/finance/payroll";
const KPI_PATH = "/finance/kpis";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CreatePetResortPayrollRunInput {
  payrollType: string;
  checkDate: string;
  amount: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  schedule: string;
  payRunAt: string;
}

export type CreatePetResortPayrollRunResult =
  | { ok: true }
  | { ok: false; error: string };

export interface UpdatePetResortPayrollRunInput
  extends Pick<CreatePetResortPayrollRunInput, "payrollType" | "checkDate" | "amount" | "payPeriodStart" | "payPeriodEnd"> {
  id: string;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function formatUsDate(date: Date): string {
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(
    date.getUTCDate()
  ).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

function validatePayrollFields(
  input: Pick<CreatePetResortPayrollRunInput, "payrollType" | "checkDate" | "amount" | "payPeriodStart" | "payPeriodEnd">
) {
  const payrollType = input.payrollType.trim();
  const checkDate = parseDateOnly(input.checkDate);
  const payPeriodStart = parseDateOnly(input.payPeriodStart);
  const payPeriodEnd = parseDateOnly(input.payPeriodEnd);
  const amount = Number(input.amount);

  if (!payrollType || payrollType.length > 50) {
    return { ok: false as const, error: "Enter a valid payroll type." };
  }
  if (!checkDate || !payPeriodStart || !payPeriodEnd) {
    return { ok: false as const, error: "Enter valid check and pay-period dates." };
  }
  if (!Number.isFinite(amount) || amount < 0 || !/^\d+(\.\d{1,2})?$/.test(input.amount)) {
    return { ok: false as const, error: "Enter a valid payroll amount with no more than two decimals." };
  }

  const payPeriodDays = Math.round(
    (payPeriodEnd.getTime() - payPeriodStart.getTime()) / MS_PER_DAY
  );
  if (payPeriodStart.getUTCDay() !== 0 || payPeriodDays !== 6) {
    return { ok: false as const, error: "Pet Resort pay periods must run Sunday through Saturday." };
  }

  const expectedCheckDate = new Date(payPeriodStart);
  expectedCheckDate.setUTCDate(expectedCheckDate.getUTCDate() + 12);
  if (checkDate.getTime() !== expectedCheckDate.getTime()) {
    return { ok: false as const, error: "The check date must be the Friday after the pay period ends." };
  }

  return {
    ok: true as const,
    data: {
      payrollType,
      checkDate,
      amount,
      payPeriod: `${formatUsDate(payPeriodStart)} to ${formatUsDate(payPeriodEnd)}`,
    },
  };
}

export async function createPetResortPayrollRun(
  input: CreatePetResortPayrollRunInput
): Promise<CreatePetResortPayrollRunResult> {
  await requireSuperAdmin();

  const schedule = input.schedule.trim();
  const payRunAt = new Date(input.payRunAt);
  const validated = validatePayrollFields(input);

  if (!validated.ok) return validated;
  if (!schedule || schedule.length > 50) {
    return { ok: false, error: "Enter a valid schedule." };
  }
  if (Number.isNaN(payRunAt.getTime())) {
    return { ok: false, error: "Enter a valid pay-run date and time." };
  }
  const { payrollType, checkDate, amount, payPeriod } = validated.data;

  try {
    const existing = await prisma.financePetResortPayrollRun.findFirst({
      where: { payrollType, checkDate, payPeriod, schedule, payRunAt },
      select: { amount: true },
    });
    if (existing) {
      return {
        ok: false,
        error:
          Number(existing.amount) === amount
            ? "This payroll run has already been entered."
            : "A payroll run with these dates and time already exists with a different amount.",
      };
    }

    await prisma.financePetResortPayrollRun.create({
      data: { payrollType, checkDate, amount, payPeriod, schedule, payRunAt },
    });
  } catch (error) {
    console.error("Failed to create Pet Resort payroll run", error);
    return { ok: false, error: "Could not save the payroll run. Please try again." };
  }

  revalidatePath(PAYROLL_PATH);
  revalidatePath(KPI_PATH);
  return { ok: true };
}

export async function updatePetResortPayrollRun(
  input: UpdatePetResortPayrollRunInput
): Promise<CreatePetResortPayrollRunResult> {
  await requireSuperAdmin();
  const validated = validatePayrollFields(input);
  if (!validated.ok) return validated;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) {
    return { ok: false, error: "Invalid payroll entry." };
  }

  try {
    await prisma.financePetResortPayrollRun.update({
      where: { id: input.id },
      data: validated.data,
    });
  } catch (error) {
    console.error("Failed to update Pet Resort payroll run", error);
    return { ok: false, error: "Could not update the payroll run. Please try again." };
  }

  revalidatePath(PAYROLL_PATH);
  revalidatePath(KPI_PATH);
  return { ok: true };
}
