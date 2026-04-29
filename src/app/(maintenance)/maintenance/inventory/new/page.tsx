import { requireAdmin } from "@/lib/auth-helpers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NewInventoryItemForm } from "./NewInventoryItemForm";
import { Company } from "@prisma/client";

export default async function NewInventoryItemPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  await requireAdmin();
  const session = await getServerSession(authOptions);
  const user = session?.user as { company?: Company | null } | undefined;
  const { company: companyParam } = await searchParams;

  const initialCompany: Company =
    companyParam === "RESORT" || companyParam === "GROOMING"
      ? companyParam
      : user?.company === "RESORT"
        ? "RESORT"
        : "GROOMING";

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Inventory Item</h1>
        <p className="text-gray-500 mt-1">Track a supply or material used in maintenance</p>
      </div>
      <NewInventoryItemForm initialCompany={initialCompany} />
    </div>
  );
}
