import { requireAuth } from "@/lib/auth-helpers";
import { getStoredDaycarePackageCreditReport } from "@/lib/moego/daycare-package-credit-report";
import { DaycarePackageCreditsReport } from "./DaycarePackageCreditsReport";

export default async function DaycarePage() {
  await requireAuth();
  const report = await getStoredDaycarePackageCreditReport();

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daycare</h1>
        <p className="mt-1 text-gray-500">
          Package credits approaching expiration
        </p>
      </div>

      <DaycarePackageCreditsReport initialReport={report} />
    </div>
  );
}
