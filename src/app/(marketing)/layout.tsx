import { AppShell } from "@/components/layout/AppShell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
        <p className="mt-1 text-gray-500">Review campaign results and advertising work.</p>
      </div>
      {children}
    </AppShell>
  );
}
