import { DaycareNotActiveReport } from "./DaycareNotActiveReport";
import { getStoredDaycareNotActiveReport } from "@/lib/moego/daycare-not-active-report";

export default async function DaycareNotActivePage() {
  const report = await getStoredDaycareNotActiveReport();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Not Active</h2>
        <p className="mt-1 text-sm text-gray-500">
          All non-deleted MoeGo clients tagged daycare. Appointment activity is shown for reference only.
        </p>
      </div>
      <DaycareNotActiveReport initialReport={report} />
    </div>
  );
}
