import { PageHeader } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/layout/AppShell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <PageHeader title="Marketing" description="Review campaign results and advertising work." className="mb-6 print:hidden" />
      {children}
    </AppShell>
  );
}
