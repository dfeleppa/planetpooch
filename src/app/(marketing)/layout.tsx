import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";
import { MarketingSubnav } from "./marketing/MarketingSubnav";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex flex-col md:flex-row min-h-screen bg-pp-bg">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
            <p className="mt-1 text-gray-500">Evaluate paid media and turn customer insights into launch-ready ads.</p>
          </div>
          <MarketingSubnav />
          {children}
        </main>
      </div>
    </Providers>
  );
}
