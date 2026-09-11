import { AppShell } from "@/components/layout/AppShell";
import { FinanceSubnav } from "./finance/FinanceSubnav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="pp-finance-screen-header mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance &amp; Payroll</h1>
        <p className="mt-1 text-gray-500">
          Financial reporting and operating data for Planet Pooch
        </p>
      </div>
      <FinanceSubnav />
      {children}
    </AppShell>
  );
}
