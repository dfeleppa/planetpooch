import { requireAdmin } from "@/lib/auth-helpers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewScheduleForm } from "./NewScheduleForm";
import { Company } from "@prisma/client";

export default async function NewSchedulePage({
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

  const allItems = await prisma.inventoryItem.findMany({
    where: { company: { in: ["RESORT", "GROOMING"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, company: true },
  });
  const inventoryItems = allItems.map((i) => ({
    ...i,
    company: i.company as "RESORT" | "GROOMING",
  }));

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Maintenance Schedule</h1>
        <p className="text-gray-500 mt-1">Set up a recurring maintenance task with inventory requirements</p>
      </div>
      <NewScheduleForm inventoryItems={inventoryItems} initialCompany={initialCompany} />
    </div>
  );
}
