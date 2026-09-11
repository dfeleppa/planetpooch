import { Providers } from "@/components/providers";
import { Sidebar } from "./Sidebar";
import { BusinessProvider } from "@/components/business/BusinessProvider";
import { BusinessSelector } from "@/components/business/BusinessSelector";
import { getActiveBusiness } from "@/lib/business-server";
import { requireAuth } from "@/lib/auth-helpers";
import { availableBusinesses } from "@/lib/business";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, business] = await Promise.all([requireAuth(), getActiveBusiness()]);
  return (
    <Providers session={session}>
      <BusinessProvider business={business}>
        <div className="flex min-h-screen flex-col bg-pp-bg md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 p-4 md:p-8">
            <BusinessSelector options={availableBusinesses(session.user)} />
            {children}
          </main>
        </div>
      </BusinessProvider>
    </Providers>
  );
}
