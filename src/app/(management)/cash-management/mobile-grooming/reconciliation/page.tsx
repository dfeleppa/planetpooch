import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PayrollPageContent } from "@/app/(finance)/finance/payroll/PayrollPageContent";

export const metadata: Metadata = { title: "Employee Verification & Weekly Closeout | Planet Pooch" };

export default async function MobileGroomingCashReconciliationPage({ searchParams }: { searchParams: Promise<{ view?: string; week?: string }> }) {
  const { view, week } = await searchParams;
  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <Link href="/cash-management" className="text-sm font-medium text-pp-accent hover:underline">← Cash Management</Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Mobile Grooming employee verification</h1>
          <p className="mt-1 text-sm text-gray-600">Verify each employee’s daily appointments and cash, then review payouts and close the Saturday–Friday week.</p>
        </div>
        <PayrollPageContent key={`${view}-${week}`} business="mobile-grooming" cashManagementMode startOnWeeklyCloseout={view === "weekly"} requestedWeek={week} />
      </div>
    </AppShell>
  );
}
