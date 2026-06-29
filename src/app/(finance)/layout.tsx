import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { FinanceSubnav } from "./finance/FinanceSubnav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex flex-col md:flex-row min-h-screen bg-pp-bg">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
            <p className="mt-1 text-gray-500">
              Financial reporting and operating data for Planet Pooch
            </p>
          </div>

          <FinanceSubnav />
          {children}
        </main>
      </div>
    </Providers>
  );
}
