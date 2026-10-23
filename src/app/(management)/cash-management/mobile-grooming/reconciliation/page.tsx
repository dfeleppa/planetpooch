import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PayrollPageContent } from "@/app/(finance)/finance/payroll/PayrollPageContent";

export const metadata: Metadata = { title: "Mobile Grooming Reconciliation | Planet Pooch" };

export default function MobileGroomingCashReconciliationPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <Link href="/cash-management" className="text-sm font-medium text-pp-accent hover:underline">← Cash Management</Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Mobile Grooming reconciliation</h1>
          <p className="mt-1 text-sm text-gray-600">Count daily cash, review the week, and complete the cash closeout.</p>
        </div>
        <PayrollPageContent business="mobile-grooming" cashManagementMode />
      </div>
    </AppShell>
  );
}
