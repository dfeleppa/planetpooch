import { AppShell } from "@/components/layout/AppShell";
import { FinanceScreenHeader } from "./FinanceScreenHeader";
import { FinanceSubnav } from "./finance/FinanceSubnav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <FinanceScreenHeader />
      <FinanceSubnav />
      {children}
    </AppShell>
  );
}
