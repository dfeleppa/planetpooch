import { getActiveBusiness } from "@/lib/business-server";
import { requireAuth, isManagerOrAbove } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryItemActions } from "./InventoryItemActions";
import Link from "next/link";

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const canManage = isManagerOrAbove((session?.user as { role?: string })?.role);

  const { itemId } = await params;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId, company: (await getActiveBusiness()).company },
    include: {
      category: true,
      counts: { orderBy: { countedAt: "desc" } },
      adjustments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { adjustedBy: { select: { name: true } } },
      },
      usages: {
        orderBy: { recordedAt: "desc" },
        take: 20,
        include: {
          maintenanceTask: { select: { id: true, title: true, completedAt: true } },
        },
      },
    },
  });

  if (!item) notFound();

  if (item.company === "GROOMING") {
    return (
      <div className="space-y-5">
        <Link href="/maintenance/inventory?company=GROOMING" className="text-sm text-blue-700 hover:underline">← Mobile Grooming inventory</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
          <p className="text-sm text-gray-500">{item.category.name}</p>
        </div>
        <div className="grid max-w-xl grid-cols-2 gap-4">
          <Card><CardContent className="py-4"><p className="text-sm text-gray-500">On Hand</p><p className="text-3xl font-bold">{item.id.startsWith("mg-item-") && item.counts.length === 0 && item.currentQuantity === 0 ? "—" : item.currentQuantity}</p></CardContent></Card>
          <Card><CardContent className="py-4"><p className="text-sm text-gray-500">Req Quantity</p><p className="text-3xl font-bold">{item.id.startsWith("mg-item-") && item.minimumThreshold === 0 ? "—" : item.minimumThreshold}</p></CardContent></Card>
        </div>
        <details className="max-w-xl rounded-xl border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer font-medium text-blue-700">View count history</summary>
          {item.counts.length ? (
            <ul className="mt-3 divide-y divide-gray-100">
              {item.counts.map((count) => <li key={count.id} className="flex justify-between py-2 text-sm"><time dateTime={count.countedAt.toISOString()}>{count.countedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}</time><strong>{count.quantity}</strong></li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-gray-500">No counts yet.</p>}
        </details>
        {canManage && <Link href="/maintenance/inventory?company=GROOMING" className="text-sm text-blue-700 hover:underline">Edit counts on the inventory page</Link>}
      </div>
    );
  }

  const isLow = item.minimumThreshold > 0 && item.currentQuantity <= item.minimumThreshold;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/maintenance/inventory" className="hover:text-blue-600">Inventory</Link>
        <span>/</span>
        <span className="text-gray-900">{item.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            <Badge variant={item.currentQuantity === 0 ? "danger" : isLow ? "warning" : "success"}>
              {item.currentQuantity === 0 ? "Out of stock" : isLow ? "Low stock" : "OK"}
            </Badge>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.category.color}`}>
              {item.category.name}
            </span>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
              {item.company === "RESORT" ? "Pet Resort" : "Mobile Grooming"}
            </span>
          </div>
          {item.description && <p className="text-gray-500">{item.description}</p>}
        </div>
        {canManage && (
          <InventoryItemActions
            itemId={itemId}
            company={item.company}
            initial={{
              name: item.name,
              description: item.description,
              categoryId: item.categoryId,
              unit: item.unit,
              minimumThreshold: item.minimumThreshold,
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{item.currentQuantity}</p>
            <p className="text-sm text-gray-500">{item.unit} on hand</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-700">{item.minimumThreshold}</p>
            <p className="text-sm text-gray-500">Minimum threshold</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-700">{item.usages.length}</p>
            <p className="text-sm text-gray-500">Times used</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><h2 className="text-base font-semibold text-gray-900">Adjustment History</h2></CardHeader>
          <CardContent className="pt-0">
            {item.adjustments.length === 0 ? (
              <p className="text-sm text-gray-500">No adjustments yet.</p>
            ) : (
              <div className="space-y-2">
                {item.adjustments.map((adj) => (
                  <div key={adj.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {adj.quantityChange > 0 ? `+${adj.quantityChange}` : adj.quantityChange} {item.unit}
                      </p>
                      <p className="text-xs text-gray-500">{adj.adjustedBy?.name ?? "(removed)"} — {adj.reason || "No reason given"}</p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(adj.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="text-base font-semibold text-gray-900">Usage History</h2></CardHeader>
          <CardContent className="pt-0">
            {item.usages.length === 0 ? (
              <p className="text-sm text-gray-500">No usage recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {item.usages.map((usage) => (
                  <div key={usage.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Link
                        href={`/maintenance/tasks/${usage.maintenanceTask.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {usage.maintenanceTask.title}
                      </Link>
                      {usage.maintenanceTask.completedAt && (
                        <p className="text-xs text-gray-500">
                          {new Date(usage.maintenanceTask.completedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      -{usage.quantityUsed} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
