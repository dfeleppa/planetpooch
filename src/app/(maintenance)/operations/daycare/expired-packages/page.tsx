import { getStoredExpiredDaycarePackageReport } from "@/lib/moego/daycare-package-credit-report";
import { ExpiredDaycarePackagesReport } from "./ExpiredDaycarePackagesReport";

export default async function ExpiredDaycarePackagesPage() {
  const report = await getStoredExpiredDaycarePackageReport();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Expired packages</h2>
        <p className="mt-1 text-sm text-gray-500">
          Full Day Daycare 5, 10, and 20 packs that expired in the last 30 days.
        </p>
      </div>
      <ExpiredDaycarePackagesReport initialReport={report} />
    </div>
  );
}
