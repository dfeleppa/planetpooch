import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { CustomerDetail } from "./CustomerDetail";

export default async function MoegoCustomerPage({
  params,
}: {
  params: Promise<{ moegoId: string }>;
}) {
  await requireSuperAdmin();
  const { moegoId } = await params;

  // Fast existence check up front so we can render a 404 without
  // shipping the client component's loading state for a bad URL.
  const exists = await prisma.moegoCustomer.findUnique({
    where: { moegoId },
    select: { moegoId: true, name: true },
  });
  if (!exists) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/finance/moego"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← MoeGo
        </Link>
      </div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {exists.name ?? "Customer"}
        </h2>
        <p className="text-gray-500 mt-1 font-mono text-xs">{exists.moegoId}</p>
      </div>
      <CustomerDetail moegoId={moegoId} />
    </div>
  );
}
