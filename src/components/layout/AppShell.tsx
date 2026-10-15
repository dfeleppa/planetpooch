import { Providers } from "@/components/providers";
import { Sidebar } from "./Sidebar";
import { BusinessProvider } from "@/components/business/BusinessProvider";
import { BusinessSelector } from "@/components/business/BusinessSelector";
import { getActiveBusiness } from "@/lib/business-server";
import { requireAuth } from "@/lib/auth-helpers";
import { availableBusinesses } from "@/lib/business";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { AskPoochWidget } from "@/components/knowledge/AskPoochWidget";
import Link from "next/link";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, business] = await Promise.all([requireAuth(), getActiveBusiness()]);
  return (
    <Providers session={session}>
      <BusinessProvider business={business}>
        <div className="flex min-h-screen flex-col bg-pp-bg md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <header className="pp-app-header hidden h-20 items-center justify-between gap-5 border-b border-pp-line bg-white px-6 md:flex xl:px-10 print:hidden">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-pp-ink-4">Planet Pooch</p>
                <p className="truncate text-sm font-medium text-pp-ink">Team workspace</p>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/knowledge" className="rounded-full border border-pp-line bg-pp-surface-2 px-4 py-2 text-sm font-medium text-pp-ink-2 transition-colors hover:border-pp-accent-line hover:bg-pp-accent-soft">
                  Ask Pooch
                </Link>
                <div className="flex items-center gap-2.5 border-l border-pp-line pl-3">
                  <span className="grid size-9 place-items-center rounded-full bg-pp-accent text-sm font-semibold text-white" aria-hidden="true">
                    {session.user.name?.charAt(0) || "?"}
                  </span>
                  <span className="max-w-36 truncate text-sm font-medium text-pp-ink">{session.user.name}</span>
                </div>
              </div>
            </header>
            <div className="mx-auto max-w-[1600px] p-4 md:p-7 xl:p-10">
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
