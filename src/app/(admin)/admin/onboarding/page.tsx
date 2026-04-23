import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default async function OnboardingDashboardPage() {
  await requireAdmin();

  const templateCount = await prisma.onboardingTemplate.count();
  const activeTemplateCount = await prisma.onboardingTemplate.count({
    where: { isActive: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
      <p className="text-gray-500 mt-1">
        Build reusable checklists for new hires and track their progress.
      </p>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Link href="/admin/onboarding/templates">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <h2 className="font-semibold text-gray-900">Templates</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {templateCount === 0
                      ? "Create your first onboarding template"
                      : `${activeTemplateCount} active / ${templateCount} total`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-60">
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">👤</span>
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900">Active Hires</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Available after Phase 4 (assignment)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
