import { requireAdmin } from "@/lib/auth-helpers";
import { NewInventoryItemForm } from "./NewInventoryItemForm";

export default async function NewInventoryItemPage() {
  await requireAdmin();
  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Inventory Item</h1>
        <p className="text-gray-500 mt-1">Track a supply or material used in maintenance</p>
      </div>
      <NewInventoryItemForm />
    </div>
  );
}
