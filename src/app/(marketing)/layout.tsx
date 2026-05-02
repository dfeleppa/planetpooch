import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex flex-col md:flex-row min-h-screen bg-pp-bg">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
      </div>
    </Providers>
  );
}
