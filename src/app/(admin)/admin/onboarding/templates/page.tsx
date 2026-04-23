import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function OnboardingTemplatesPage() {
  await requireAdmin();

  const templates = await prisma.onboardingTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/onboarding" className="hover:text-blue-600">
              Onboarding
            </Link>
            <span>/</span>
            <span className="text-gray-900">Templates</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Templates</h1>
          <p className="text-gray-500 mt-1">
            Reusable checklists assigned to new hires. Template edits don&apos;t
            change in-flight onboardings.
          </p>
        </div>
        <Link href="/admin/onboarding/templates/new">
          <Button>+ New Template</Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="📋"
              title="No templates yet"
              description="Create your first template to define the onboarding checklist for new hires."
              action={
                <Link href="/admin/onboarding/templates/new">
                  <Button>+ New Template</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/onboarding/templates/${t.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {t.name}
                    </Link>
                    {t.description && (
                      <p className="text-sm text-gray-500 mt-1">{t.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{t._count.tasks} task{t._count.tasks === 1 ? "" : "s"}</span>
                      <span>·</span>
                      <span>Created {formatDate(t.createdAt)} by {t.createdBy.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="default">Inactive</Badge>
                    )}
                    <Link href={`/admin/onboarding/templates/${t.id}`}>
                      <Button variant="secondary" size="sm">Edit</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
