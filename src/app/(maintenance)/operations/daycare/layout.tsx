import { requireAuth } from "@/lib/auth-helpers";
import { DaycareSubnav } from "./DaycareSubnav";

export default async function DaycareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daycare</h1>
        <p className="mt-1 text-gray-500">Operational reports from MoeGo</p>
      </div>
      <DaycareSubnav />
      {children}
    </div>
  );
}
