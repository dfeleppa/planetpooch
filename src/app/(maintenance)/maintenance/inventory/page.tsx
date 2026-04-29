import { requireAuth, isManagerOrAbove } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompanyFilterTabs, resolveCompanyParam } from "@/components/ui/CompanyFilterTabs";
import { InventoryTable } from "./InventoryTable";
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
  const canManage = isManagerOrAbove(user?.role);

  const { company: companyParam } = await searchParams;
  const resolved = resolveCompanyParam(companyParam, defaultCompany(user?.company));
  const active: Company = resolved === "ALL" ? defaultCompany(user?.company) : resolved;

  const items = await prisma.inventoryItem.findMany({
    where: { company: active },
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
        {canManage && (
          <Link href={`/maintenance/inventory/new?company=${active}`}>
            <Button>+ Add Item</Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <CompanyFilterTabs basePath="/maintenance/inventory" active={active} hideAll />
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="📦"
              title="No inventory items"
              description="Add items to track supplies needed for maintenance tasks."
              action={
                canManage ? (
                  <Link href={`/maintenance/inventory/new?company=${active}`}>
                    <Button>+ Add Item</Button>
                  </Link>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <InventoryTable items={items} />
      )}
    </div>
  );
}
