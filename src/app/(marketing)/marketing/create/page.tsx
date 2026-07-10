import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IDEA_STATUS_LABELS, IDEA_STATUS_VARIANT, SERVICE_LINE_LABELS } from "@/lib/marketing/ideas";
import type { IdeaStatus, ServiceLine } from "@prisma/client";
import { IdeaStatusSchema, ServiceLineSchema } from "@/lib/validators/marketing";

const STATUS_FILTERS: Array<IdeaStatus | "ALL"> = ["ALL", "DRAFT", "IN_PRODUCTION", "SHIPPED", "ARCHIVED"];
const SERVICES: ServiceLine[] = ["GROOMING", "DAYCARE", "BOARDING", "TRAINING", "MULTIPLE"];

export default async function CreateAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; serviceLine?: string }>;
}) {
  await requireMarketing();
  const query = await searchParams;
  const parsedStatus = query.status ? IdeaStatusSchema.safeParse(query.status) : null;
  const activeStatus: IdeaStatus | "ALL" = query.status === "ALL" ? "ALL" : parsedStatus?.success ? parsedStatus.data : "ALL";
  const parsedService = query.serviceLine ? ServiceLineSchema.safeParse(query.serviceLine) : null;
  const activeService = parsedService?.success ? parsedService.data : null;

  const briefs = await prisma.marketingIdea.findMany({
    where: {
      ...(activeStatus === "ALL" ? {} : { status: activeStatus }),
      ...(activeService ? { serviceLine: activeService } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { adAssets: true, scripts: true } },
      adAssets: {
        select: { status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  function filterHref(status: IdeaStatus | "ALL", service: ServiceLine | null = activeService) {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (service) params.set("serviceLine", service);
    const qs = params.toString();
    return qs ? `/marketing/create?${qs}` : "/marketing/create";
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Content library</h2>
          <p className="mt-1 text-sm text-gray-500">One brief can produce Meta, Google Search, and video assets.</p>
        </div>
        <Link href="/marketing/create/new" className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New ad brief
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((status) => (
            <Link
              key={status}
              href={filterHref(status)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeStatus === status ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {status === "ALL" ? "All" : IDEA_STATUS_LABELS[status]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={filterHref(activeStatus, null)} className={`rounded-full px-2.5 py-1 text-xs ${activeService === null ? "bg-blue-100 text-blue-800" : "text-gray-500 hover:bg-gray-100"}`}>All services</Link>
          {SERVICES.map((service) => (
            <Link key={service} href={filterHref(activeStatus, service)} className={`rounded-full px-2.5 py-1 text-xs ${activeService === service ? "bg-blue-100 text-blue-800" : "text-gray-500 hover:bg-gray-100"}`}>
              {SERVICE_LINE_LABELS[service]}
            </Link>
          ))}
        </div>
      </div>

      {briefs.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-sm font-medium text-gray-800">No briefs match these filters</p>
            <p className="mt-1 text-xs text-gray-500">Start with a customer insight, then generate the channel-ready assets.</p>
            <Link href="/marketing/create/new" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline">Create an ad brief</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {briefs.map((brief) => {
            const channels = brief.channels.length > 0 ? brief.channels : ["META"];
            const winner = brief.adAssets[0]?.status === "WINNER";
            return (
              <Link key={brief.id} href={`/marketing/create/${brief.id}`} className="group block">
                <Card className="h-full transition-colors group-hover:border-blue-300 group-hover:bg-blue-50/20">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-gray-900">{brief.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{brief.insight || "No customer insight added yet."}</p>
                      </div>
                      <Badge variant={winner ? "success" : IDEA_STATUS_VARIANT[brief.status]}>{winner ? "Winner" : IDEA_STATUS_LABELS[brief.status]}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <Badge variant="info">{SERVICE_LINE_LABELS[brief.serviceLine]}</Badge>
                      {channels.map((channel) => <Badge key={channel}>{channel === "GOOGLE_SEARCH" ? "Google Search" : "Meta"}</Badge>)}
                      <span>{brief._count.adAssets} packages</span>
                      {brief._count.scripts > 0 && <span>{brief._count.scripts} scripts</span>}
                      <span className="ml-auto">Updated {new Date(brief.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
