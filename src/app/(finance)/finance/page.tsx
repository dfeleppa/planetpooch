import { requireSuperAdmin } from "@/lib/auth-helpers";
import { WeeklyFinancialSnapshot } from "./WeeklyFinancialSnapshot";

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; week?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="mt-1 text-gray-500">Weekly financial snapshot for Planet Pooch</p>
      </div>

      <WeeklyFinancialSnapshot year={params.year} week={params.week} />
    </div>
  );
}
