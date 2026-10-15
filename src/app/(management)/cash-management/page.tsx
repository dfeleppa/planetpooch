import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { requireSuperAdmin } from "@/lib/auth-helpers";

export const metadata: Metadata = { title: "Cash Management | Planet Pooch" };

export default async function CashManagementPage() {
  await requireSuperAdmin();

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Management</h1>
          <p className="mt-1 text-gray-500">Cash activity for the selected business</p>
        </div>
        <div className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Cash management workspace</h2>
          <p className="mt-2 text-gray-500">Cash tracking tools can be added here.</p>
        </div>
      </div>
    </AppShell>
  );
}
