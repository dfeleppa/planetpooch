import { Providers } from "@/components/providers";
import { Sidebar } from "./Sidebar";
import { BusinessProvider } from "@/components/business/BusinessProvider";
import { BusinessSelector } from "@/components/business/BusinessSelector";
import { getActiveBusiness } from "@/lib/business-server";
import { requireAuth } from "@/lib/auth-helpers";
import { availableBusinesses } from "@/lib/business";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { AskPoochWidget } from "@/components/knowledge/AskPoochWidget";
import { UserMenu } from "./UserMenu";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, business] = await Promise.all([requireAuth(), getActiveBusiness()]);
  return (
    <Providers session={session}>
      <BusinessProvider business={business}>
        <div className="flex min-h-screen flex-col bg-pp-bg md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-[1600px] p-4 md:p-7 xl:p-10">
              <div className="mb-4 hidden justify-end print:hidden md:flex">
                <UserMenu />
              </div>
              <BusinessSelector options={availableBusinesses(session.user)} />
              {children}
            </div>
          </main>
          {isKnowledgeOwner(session.user) && <AskPoochWidget />}
        </div>
      </BusinessProvider>
    </Providers>
  );
}
