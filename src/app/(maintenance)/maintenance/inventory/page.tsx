import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { CompanyFilterTabs, resolveCompanyParam } from "@/components/ui/CompanyFilterTabs";
import { Company } from "@prisma/client";
import Link from "next/link";

function defaultCompany(userCompany: Company | null | undefined): Company {
  return userCompany === "RESORT" ? "RESORT" : "GROOMING";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; company?: Company | null } | undefined;
  const isAdmin = user?.role === "ADMIN";

  const { company: companyParam } = await searchParams;
  const active = resolveCompanyParam(companyParam, defaultCompany(user?.company));

  const items = await prisma.inventoryItem.findMany({
    where: active === "ALL" ? {} : { company: active },
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
          <Link
            href={`/maintenance/inventory/new${active !== "ALL" ? `?company=${active}` : ""}`}
          >
            <Button>+ Add Item</Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <CompanyFilterTabs basePath="/maintenance/inventory" active={active} />
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
                  <Link
                    href={`/maintenance/inventory/new${active !== "ALL" ? `?company=${active}` : ""}`}
                  >
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
              {active === "ALL" && <TableHeader>Company</TableHeader>}
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
                  {active === "ALL" && (
                    <TableCell className="text-gray-600 text-xs">
                      {item.company === "RESORT" ? "Pet Resort" : "Mobile Grooming"}
                    </TableCell>
                  )}
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
