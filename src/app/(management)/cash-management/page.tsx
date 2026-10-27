import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { mobileGroomingCashSummary, petResortCashSummary, SAFE_CENTS } from "@/lib/cash-management";
import { prisma } from "@/lib/prisma";
import { CashManagementDashboard } from "./CashManagementDashboard";

export const metadata: Metadata = { title: "Cash Management | Planet Pooch" };

export default async function CashManagementPage() {
  await requireSuperAdmin();
  const [mobile, petResort, latestSafeVerification] = await Promise.all([
    mobileGroomingCashSummary(),
    petResortCashSummary(),
    prisma.safeBalanceVerification.findFirst({
      orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
      select: { countedCents: true, verifiedAt: true },
    }),
  ]);

  return (
    <AppShell>
      <CashManagementDashboard mobile={mobile} petResort={petResort} safeCents={SAFE_CENTS} initialSafeVerification={latestSafeVerification ? { countedCents: latestSafeVerification.countedCents, verifiedAt: latestSafeVerification.verifiedAt.toISOString() } : null} />
    </AppShell>
  );
}
