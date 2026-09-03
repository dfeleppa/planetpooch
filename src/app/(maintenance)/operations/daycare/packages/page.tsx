import { DaycarePackageCreditsReport } from "../DaycarePackageCreditsReport";
import { getStoredDaycarePackageCreditReport } from "@/lib/moego/daycare-package-credit-report";

export default async function DaycarePackagesPage() {
  const report = await getStoredDaycarePackageCreditReport();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Expiring Soon</h2>
        <p className="mt-1 text-sm text-gray-500">
          Remaining daycare package credits approaching expiration.
        </p>
      </div>
      <DaycarePackageCreditsReport initialReport={report} />
    </div>
  );
}
