import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen bg-pp-bg">
        <Sidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </Providers>
  );
}
