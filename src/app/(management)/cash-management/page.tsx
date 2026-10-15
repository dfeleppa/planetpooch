import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { mobileGroomingCashSummary, SAFE_CENTS } from "@/lib/cash-management";
import { CashManagementDashboard } from "./CashManagementDashboard";

export const metadata: Metadata = { title: "Cash Management | Planet Pooch" };

export default async function CashManagementPage() {
  await requireSuperAdmin();
  const mobile = await mobileGroomingCashSummary();

  return (
    <AppShell>
      <CashManagementDashboard mobile={mobile} safeCents={SAFE_CENTS} />
    </AppShell>
  );
}
