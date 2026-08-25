"use server";

import { KpiSegment } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const COMMISSIONS_PATH = "/finance/payroll/commissions";

const COMMISSION_CONFIG = {
  Kim: {
    segment: KpiSegment.BOARDING,
    segmentLabel: "Boarding",
    metrics: ["package_sales", "addon_sales"],
  },
  Rebecca: {
    segment: KpiSegment.TRAINING,
    segmentLabel: "Training",
    metrics: ["product_sales", "group_revenue", "one_on_one_revenue"],
  },
  Gabriela: {
    segment: KpiSegment.IN_HOUSE_GROOMING,
    segmentLabel: "In-House Grooming",
    metrics: ["revenue", "upsells"],
  },
} as const;

export type CommissionBusinessSegment = "BOARDING" | "TRAINING" | "IN_HOUSE_GROOMING";

export interface SaveCommissionInput {
  id?: string;
  employeeName: string;
  businessSegment: CommissionBusinessSegment;
  weekStart: string;
  paidDate: string;
  confirmEdit?: boolean;
  expectedUpdatedAt?: string;
}

export type SaveCommissionResult =
  | { ok: true }
  | { ok: false; error: string };

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export async function saveCommissionPaidDate(
  input: SaveCommissionInput
): Promise<SaveCommissionResult> {
  await requireSuperAdmin();

  const config =
    input.employeeName === "Kim"
      ? COMMISSION_CONFIG.Kim
      : input.employeeName === "Rebecca"
        ? COMMISSION_CONFIG.Rebecca
        : input.employeeName === "Gabriela"
          ? COMMISSION_CONFIG.Gabriela
          : null;
  if (!config || input.businessSegment !== config.segment) {
    return { ok: false, error: "The employee and business segment do not match." };
  }

  const weekStart = parseDateOnly(input.weekStart);
  if (!weekStart) {
    return {
      ok: false,
      error: `The ${config.segmentLabel} week is invalid. Refresh the page and try again.`,
    };
  }

  const paidDate = input.paidDate ? parseDateOnly(input.paidDate) : null;
  if (input.paidDate && !paidDate) {
    return { ok: false, error: "Choose a valid paid date." };
  }
  if (!input.id && !paidDate) {
    return { ok: false, error: `Choose the date ${input.employeeName} was paid.` };
  }

  const metricCount = await prisma.kpiWeeklyValue.count({
    where: {
      segment: config.segment,
      weekStart,
      metricKey: { in: [...config.metrics] },
    },
  });
  if (metricCount === 0) {
    return {
      ok: false,
      error: `No ${config.segmentLabel} revenue data exists for this week. Refresh the page and try again.`,
    };
  }

  try {
    if (input.id) {
      if (!input.confirmEdit) {
        return { ok: false, error: "Confirm the edit warning before changing a saved paid date." };
      }

      const expectedUpdatedAt = input.expectedUpdatedAt
        ? new Date(input.expectedUpdatedAt)
        : null;
      if (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) {
        return { ok: false, error: "Refresh the page before editing this paid date." };
      }

      const updated = await prisma.financeEmployeeCommission.updateMany({
        where: {
          id: input.id,
          employeeName: input.employeeName,
          businessSegment: config.segment,
          weekStart,
          updatedAt: expectedUpdatedAt,
        },
        data: { paidDate },
      });

      if (updated.count !== 1) {
        return {
          ok: false,
          error: "This paid date changed after you opened it. Refresh and review it before editing.",
        };
      }
    } else {
      await prisma.financeEmployeeCommission.create({
        data: {
          employeeName: input.employeeName,
          businessSegment: config.segment,
          weekStart,
          paidDate,
        },
      });
    }
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return {
        ok: false,
        error: `${input.employeeName} already has a paid-date entry for this ${config.segmentLabel} week.`,
      };
    }
    console.error("Failed to save commission paid date", error);
    return { ok: false, error: "Could not save the paid date. Please try again." };
  }

  revalidatePath(COMMISSIONS_PATH);
  return { ok: true };
}
