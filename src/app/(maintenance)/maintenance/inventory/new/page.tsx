import { PageHeader } from "@/components/ui/PageHeader";
import { getActiveBusiness } from "@/lib/business-server";
import { requireAdmin } from "@/lib/auth-helpers";
import { NewInventoryItemForm } from "./NewInventoryItemForm";

export default async function NewInventoryItemPage() {
  await requireAdmin();

  const initialCompany = (await getActiveBusiness()).company;

  return (
    <div className="max-w-lg">
      <PageHeader title="Add Inventory Item" description="Track a supply or material used in maintenance" className="mb-6" />
      <NewInventoryItemForm initialCompany={initialCompany} />
    </div>
  );
}
