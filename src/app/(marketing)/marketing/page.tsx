import { requireMarketing } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default async function MarketingDashboardPage() {
  await requireMarketing();

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
          <p className="text-gray-500 mt-1">
            Ideas, scripts, ad copy, and performance for Planet Pooch
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Active Ideas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Live Placements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Running Experiments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Spend (7d)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Getting started</h2>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-gray-500">
            This section is being built. Next up: brand voice profile, ideas
            list, and the first generator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
