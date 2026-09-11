import { AppShell } from "@/components/layout/AppShell";
import { MarketingSubnav } from "./marketing/MarketingSubnav";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
        <p className="mt-1 text-gray-500">Evaluate paid media and turn customer insights into launch-ready ads.</p>
      </div>
      <MarketingSubnav />
      {children}
    </AppShell>
  );
}
