import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IDEA_STATUS_LABELS,
  IDEA_STATUS_VARIANT,
  SERVICE_LINE_LABELS,
} from "@/lib/marketing/ideas";
import type { IdeaStatus, ServiceLine } from "@prisma/client";
import {
  IdeaStatusSchema,
  ServiceLineSchema,
} from "@/lib/validators/marketing";

const STATUS_TABS: (IdeaStatus | "ALL")[] = [
  "DRAFT",
  "IN_PRODUCTION",
  "SHIPPED",
  "ARCHIVED",
  "ALL",
];

const SERVICE_LINE_OPTIONS: ServiceLine[] = [
  "GROOMING",
  "DAYCARE",
  "BOARDING",
  "TRAINING",
  "MULTIPLE",
];

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; serviceLine?: string }>;
}) {
  await requireMarketing();
  const sp = await searchParams;

  const statusParsed = sp.status ? IdeaStatusSchema.safeParse(sp.status) : null;
  const activeStatus: IdeaStatus | "ALL" =
    sp.status === "ALL"
      ? "ALL"
      : statusParsed?.success
      ? statusParsed.data
      : "DRAFT";

  const serviceLineParsed = sp.serviceLine
    ? ServiceLineSchema.safeParse(sp.serviceLine)
    : null;
  const activeServiceLine: ServiceLine | null = serviceLineParsed?.success
    ? serviceLineParsed.data
    : null;

  const ideas = await prisma.marketingIdea.findMany({
    where: {
      ...(activeStatus !== "ALL" ? { status: activeStatus } : {}),
      ...(activeServiceLine ? { serviceLine: activeServiceLine } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  function tabHref(status: IdeaStatus | "ALL") {
    const params = new URLSearchParams();
    params.set("status", status);
    if (activeServiceLine) params.set("serviceLine", activeServiceLine);
    return `/marketing/ideas?${params.toString()}`;
  }

  function serviceLineHref(line: ServiceLine | null) {
    const params = new URLSearchParams();
    params.set("status", activeStatus);
    if (line) params.set("serviceLine", line);
    return `/marketing/ideas?${params.toString()}`;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ideas</h1>
          <p className="text-gray-500 mt-1">
            Seed insights for scripts, hooks, and ad copy.
          </p>
        </div>
        <Link href="/marketing/ideas/new">
          <Button>+ New Idea</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200">
        {STATUS_TABS.map((s) => {
          const active = s === activeStatus;
          return (
            <Link
              key={s}
              href={tabHref(s)}
              className={
                "px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors " +
                (active
                  ? "border-blue-600 text-blue-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700")
              }
            >
              {s === "ALL" ? "All" : IDEA_STATUS_LABELS[s]}
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={serviceLineHref(null)}
          className={
            "rounded-full px-3 py-1 text-xs transition-colors " +
            (activeServiceLine === null
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200")
          }
        >
          All services
        </Link>
        {SERVICE_LINE_OPTIONS.map((line) => {
          const active = activeServiceLine === line;
          return (
            <Link
              key={line}
              href={serviceLineHref(line)}
              className={
                "rounded-full px-3 py-1 text-xs transition-colors " +
                (active
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200")
              }
            >
              {SERVICE_LINE_LABELS[line]}
            </Link>
          );
        })}
      </div>

      {ideas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-500">
              No ideas match the current filter.
            </p>
            <Link
              href="/marketing/ideas/new"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              Create your first idea
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ideas.map((idea) => (
            <Link
              key={idea.id}
              href={`/marketing/ideas/${idea.id}`}
              className="block"
            >
              <Card className="h-full hover:bg-gray-50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {idea.title}
                    </h3>
                    <Badge variant={IDEA_STATUS_VARIANT[idea.status]}>
                      {IDEA_STATUS_LABELS[idea.status]}
                    </Badge>
                  </div>
                  {idea.insight && (
                    <p className="text-xs text-gray-600 line-clamp-3 mb-3 whitespace-pre-line">
                      {idea.insight}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <Badge variant="info">
                      {SERVICE_LINE_LABELS[idea.serviceLine]}
                    </Badge>
                    {idea.audience && (
                      <span className="truncate max-w-[160px]">
                        {idea.audience}
                      </span>
                    )}
                    <span className="ml-auto whitespace-nowrap">
                      {idea.createdBy?.name ?? "—"} ·{" "}
                      {new Date(idea.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
