import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";

const categoryLabels: Record<string, string> = {
  TOOLS: "Tools",
  MATERIALS: "Materials",
  EQUIPMENT: "Equipment",
  PARTS: "Parts",
  SUPPLIES: "Supplies",
  OTHER: "Other",
};

const categoryColors: Record<string, string> = {
  TOOLS: "bg-purple-100 text-purple-800",
  MATERIALS: "bg-blue-100 text-blue-800",
  EQUIPMENT: "bg-green-100 text-green-800",
  PARTS: "bg-orange-100 text-orange-800",
  SUPPLIES: "bg-gray-100 text-gray-800",
  OTHER: "bg-slate-100 text-slate-800",
};

export default async function InventoryPage() {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const items = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
    include: { category: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 mt-1">Supplies and materials tracked for maintenance</p>
        </div>
        {isAdmin && (
          <Link href="/maintenance/inventory/new">
            <Button>+ Add Item</Button>
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="📦"
              title="No inventory items"
              description="Add items to track supplies needed for maintenance tasks."
              action={
                isAdmin ? (
                  <Link href="/maintenance/inventory/new">
                    <Button>+ Add Item</Button>
                  </Link>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeader>Name</TableHeader>
              <TableHeader>Category</TableHeader>
              <TableHeader>Unit</TableHeader>
              <TableHeader>On Hand</TableHeader>
              <TableHeader>Min. Threshold</TableHeader>
              <TableHeader>Status</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const isLow = item.minimumThreshold > 0 && item.currentQuantity <= item.minimumThreshold;
              const isOut = item.currentQuantity === 0;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`/maintenance/inventory/${item.id}`} className="font-medium text-blue-600 hover:underline">
                      {item.name}
                    </Link>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${item.category.color}`}>
                      {item.category.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-600">{item.unit}</TableCell>
                  <TableCell className="font-semibold text-gray-900">{item.currentQuantity}</TableCell>
                  <TableCell className="text-gray-600">{item.minimumThreshold || "—"}</TableCell>
                  <TableCell>
                    {isOut ? (
                      <Badge variant="danger">Out of stock</Badge>
                    ) : isLow ? (
                      <Badge variant="warning">Low stock</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
