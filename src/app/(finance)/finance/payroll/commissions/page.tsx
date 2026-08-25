import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { PayrollSubnav } from "../PayrollSubnav";

export default async function CommissionsPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <PayrollSubnav active="commissions" />

      <div>
        <h2 className="text-xl font-semibold text-gray-900">Commissions</h2>
        <p className="mt-1 text-gray-500">Employee commission reporting and calculations</p>
      </div>

      <Card>
        <CardContent>
          <EmptyState
            icon="%"
            title="Commission tracking is ready for setup"
            description="Commission details will appear here once the commission data source and calculation rules are connected."
          />
        </CardContent>
      </Card>
    </div>
  );
}
