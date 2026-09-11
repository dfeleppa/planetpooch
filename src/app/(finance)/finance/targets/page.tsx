import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";

const targets = [
  {
    segment: "In-house grooming",
    currentEstimate: 90_000,
    nextYearTarget: 200_000,
    increase: 110_000,
    growthNeeded: "122.2%",
  },
  {
    segment: "Daycare",
    currentEstimate: 310_000,
    nextYearTarget: 500_000,
    increase: 190_000,
    growthNeeded: "61.3%",
  },
  {
    segment: "Boarding",
    currentEstimate: 430_000,
    nextYearTarget: 600_000,
    increase: 170_000,
    growthNeeded: "39.5%",
  },
] as const;

const totals = {
  currentEstimate: 830_000,
  nextYearTarget: 1_300_000,
  increase: 470_000,
  growthNeeded: "56.6%",
} as const;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function TargetsPage() {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company === "GROOMING") {
    redirect("/finance/payroll/mobile-grooming");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Targets</h2>
        <p className="mt-1 text-gray-500">Next-year annual revenue targets for Pet Resort</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Combined next-year target</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
            {currency.format(totals.nextYearTarget)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Additional annual revenue needed</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
            {currency.format(totals.increase)}
          </p>
          <p className="mt-1 text-sm font-medium text-gray-500">{totals.growthNeeded} growth</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th scope="col" className="px-5 py-3">Segment</th>
              <th scope="col" className="px-5 py-3 text-right">Current Estimate</th>
              <th scope="col" className="px-5 py-3 text-right">Next-Year Target</th>
              <th scope="col" className="px-5 py-3 text-right">Increase</th>
              <th scope="col" className="px-5 py-3 text-right">Growth Needed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {targets.map((target) => (
              <tr key={target.segment}>
                <th scope="row" className="whitespace-nowrap px-5 py-4 text-left font-medium text-gray-900">
                  {target.segment}
                </th>
                <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-gray-700">
                  {currency.format(target.currentEstimate)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-gray-700">
                  {currency.format(target.nextYearTarget)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-gray-700">
                  {currency.format(target.increase)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums text-gray-700">
                  {target.growthNeeded}
                </td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold text-gray-900">
              <th scope="row" className="px-5 py-4 text-left">Total</th>
              <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">
                {currency.format(totals.currentEstimate)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">
                {currency.format(totals.nextYearTarget)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">
                {currency.format(totals.increase)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">
                {totals.growthNeeded}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-600">
        The combined next-year target is <strong className="text-gray-900">$1.3 million</strong>,
        requiring <strong className="text-gray-900">$470,000 in additional annual revenue</strong>.
      </p>
    </div>
  );
}
