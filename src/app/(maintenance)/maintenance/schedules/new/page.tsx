import { PageHeader } from "@/components/ui/PageHeader";
import { getActiveBusiness } from "@/lib/business-server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { NewScheduleForm } from "./NewScheduleForm";
import { VanSubnav } from "@/components/maintenance/VanSubnav";

export default async function NewSchedulePage() {
  await requireAdmin();

  const initialCompany = (await getActiveBusiness()).company;

  const allItems = await prisma.inventoryItem.findMany({
    where: { company: initialCompany },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, company: true },
  });
  const inventoryItems = allItems.map((i) => ({
    ...i,
    company: i.company as "RESORT" | "GROOMING",
  }));

  return (
    <div className="w-full">
      <PageHeader title="New Maintenance Schedule" description="Set up a recurring maintenance task with inventory requirements" className="mb-6" />
      {initialCompany === "GROOMING" && <VanSubnav active="schedules" />}
      <NewScheduleForm inventoryItems={inventoryItems} initialCompany={initialCompany} />
    </div>
  );
}
