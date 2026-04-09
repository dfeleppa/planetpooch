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

export default async function InventoryPage() {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const items = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
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
