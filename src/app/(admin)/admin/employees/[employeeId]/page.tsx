import { requireEmployeeManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Company, Role } from "@prisma/client";
import { EditEmployeeForm } from "./EditEmployeeForm";
import { EsignRequestsCard } from "./EsignRequestsCard";
import { DriveFolderCard } from "./DriveFolderCard";
import { RevealTempPasswordButton } from "../RevealTempPasswordButton";
import { EmployeeDocumentsCard } from "@/components/EmployeeDocumentsCard";
import { DangerZoneCard } from "./DangerZoneCard";
import { EmployeeModuleAssignments } from "./EmployeeModuleAssignments";
import { DAYS_OF_WEEK, formatTimeLabel } from "@/lib/availability";
import { getFileWebLink, isDriveEnabled, isStubId } from "@/lib/drive";
import { formatDate } from "@/lib/utils";
import { HANDBOOK_SIGNABLE_NAME } from "@/lib/employee-documents";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";
import { EmployeeModuleProgressTable, type ModuleProgressRow } from "./EmployeeModuleProgressTable";

const COMPANIES: Company[] = ["GROOMING", "RESORT", "CORPORATE"];

function addTitle(
  options: Record<Company, Set<string>>,
  company: Company,
  title: string
) {
  if (title.trim()) options[company].add(title.trim());
}

function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  const timestamps = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const session = await requireEmployeeManager();
  const sessionUser = session.user as {
    role: Role;
    company: Company;
    jobTitle: string | null;
  };
  const companyFilter = getCompanyFilter(
    sessionUser.role,
    sessionUser.company,
    sessionUser.jobTitle
  );
  const callerIsScopedTier =
    sessionUser.role === "MANAGER";
  const { employeeId } = await params;
  const positionWhere = companyFilter.company
    ? { OR: [{ company: companyFilter.company }, { company: null }] }
    : {};

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      company: true,
      jobTitle: true,
      department: true,
      phone: true,
      hireDate: true,
      driveFolderId: true,
      ssCardNotNeeded: true,
      createdAt: true,
      lastLoginAt: true,
      terminatedAt: true,
      terminationReason: true,
      terminatedBy: { select: { id: true, name: true } },
    },
  });

  if (!employee) notFound();
  if (companyFilter.company && employee.company !== companyFilter.company) notFound();
  if (callerIsScopedTier && employee.role !== "EMPLOYEE") notFound();

  const visibleModuleIds = await getVisibleModuleIdsForUser(
    employee.id,
    employee.jobTitle,
    employee.company,
  );

  const modules = await prisma.module.findMany({
    where: { id: { in: [...visibleModuleIds] } },
    orderBy: { order: "asc" },
    include: {
      subsections: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, estimatedMinutes: true },
          },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: employeeId },
    select: { lessonId: true, isCompleted: true, completedAt: true },
  });

  const completionMap = new Map(completions.map((c) => [c.lessonId, c]));
  const moduleProgressRows: ModuleProgressRow[] = modules.map((mod) => {
    const allLessons = mod.subsections.flatMap((s) => s.lessons);
    const total = allLessons.length;
    const completedLessons = allLessons.filter(
      (lesson) => completionMap.get(lesson.id)?.isCompleted,
    );
    const completed = completedLessons.length;
    const completedAt =
      total > 0 && completed === total
        ? completedLessons
            .map((lesson) => completionMap.get(lesson.id)?.completedAt)
            .filter((date): date is Date => date instanceof Date)
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : null;

    return {
      id: mod.id,
      title: mod.title,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      completedAt: completedAt ? formatDateTime(completedAt) : null,
      subsections: mod.subsections.map((subsection) => {
        const subsectionCompleted = subsection.lessons.filter(
          (lesson) => completionMap.get(lesson.id)?.isCompleted,
        ).length;

        return {
          id: subsection.id,
          title: subsection.title,
          completed: subsectionCompleted,
          total: subsection.lessons.length,
          lessons: subsection.lessons.map((lesson) => {
            const completion = completionMap.get(lesson.id);

            return {
              id: lesson.id,
              title: lesson.title,
              isCompleted: !!completion?.isCompleted,
              completedAt:
                completion?.isCompleted && completion.completedAt
                  ? formatDateTime(completion.completedAt)
                  : null,
            };
          }),
        };
      }),
    };
  });

  const recentAudit = await prisma.completionAuditLog.findMany({
    where: { userId: employeeId },
    orderBy: { timestamp: "desc" },
    take: 20,
    include: { lesson: { select: { title: true } } },
  });

  const [
    signableDocuments,
    esignRequests,
    availability,
    employeeDocuments,
    documentIssues,
    orgPositions,
  ] = await Promise.all([
    prisma.signableDocument.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    }),
    prisma.esignRequest.findMany({
      where: { userId: employeeId },
      orderBy: { createdAt: "desc" },
      include: {
        signableDocument: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        verifiedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.employeeAvailability.findMany({
      where: { userId: employeeId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.employeeDocument.findMany({
      where: { userId: employeeId },
      orderBy: { uploadedAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.employeeDocumentIssue.findMany({
      where: { userId: employeeId },
      include: {
        flaggedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.orgPosition.findMany({
      where: positionWhere,
      select: { title: true, company: true },
      orderBy: [{ company: "asc" }, { title: "asc" }],
    }),
  ]);
  const optionSets: Record<Company, Set<string>> = {
    GROOMING: new Set(),
    RESORT: new Set(),
    CORPORATE: new Set(),
  };
  for (const pos of orgPositions) {
    if (pos.company) {
      addTitle(optionSets, pos.company, pos.title);
    } else {
      addTitle(optionSets, "CORPORATE", pos.title);
      if (companyFilter.company) addTitle(optionSets, companyFilter.company, pos.title);
    }
  }
  const jobTitleOptions = Object.fromEntries(
    COMPANIES.map((company) => [
      company,
      Array.from(optionSets[company]).sort((a, b) => a.localeCompare(b)),
    ])
  ) as Record<Company, string[]>;

  const availabilityByDay = new Map(availability.map((a) => [a.dayOfWeek, a]));
  const availabilityRows = DAYS_OF_WEEK.map((day) => {
    const entry = availabilityByDay.get(day.value);
    return {
      day: day.label,
      value: entry
        ? `${formatTimeLabel(entry.startTime)} – ${formatTimeLabel(entry.endTime)}`
        : "Unavailable",
      isAvailable: !!entry,
    };
  });
  const latestTrackedActivityAt = latestDate(
    employee.lastLoginAt,
    recentAudit[0]?.timestamp,
  );

  const driveFolderWebLink = employee.driveFolderId
    ? await getFileWebLink(employee.driveFolderId)
    : null;

  const isTerminated = !!employee.terminatedAt;

  const handbookSigned = esignRequests.some(
    (r) =>
      r.signableDocument.name === HANDBOOK_SIGNABLE_NAME &&
      r.status === "SIGNED",
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/admin/employees" className="hover:text-blue-600">Employees</Link>
        <span>/</span>
        <span className="text-gray-900">{employee.name}</span>
      </div>

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{employee.name}</h1>
        {isTerminated && <Badge variant="default">Past employee</Badge>}
      </div>
      <p className="text-gray-500">
        {employee.email.endsWith("@placeholder.local") ? "No email on file" : employee.email}
      </p>

      {isTerminated && employee.terminatedAt && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            <span className="font-medium">Past employee.</span> Terminated{" "}
            {formatDate(employee.terminatedAt)}
            {employee.terminatedBy && <> by {employee.terminatedBy.name}</>}.
            {employee.terminationReason && (
              <> Reason: {employee.terminationReason}.</>
            )}
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Login is disabled and new eSign requests can&apos;t be sent. The Drive
            folder and historical records are preserved.
          </p>
        </div>
      )}

      <div className="mt-6">
        <EditEmployeeForm
          employee={{
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
            role: employee.role,
            company: employee.company,
            jobTitle: employee.jobTitle,
            department: employee.department,
            phone: employee.phone,
            hireDate: employee.hireDate ? employee.hireDate.toISOString() : null,
          }}
          canEditCompany={!callerIsScopedTier}
          canAssignSuperAdmin={sessionUser.role === "SUPER_ADMIN"}
          canEditRole={sessionUser.role === "SUPER_ADMIN"}
          jobTitleOptions={jobTitleOptions}
          availabilityRows={availabilityRows}
        />
      </div>

      {!isTerminated && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Login access</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <span className="font-medium text-gray-700">Last tracked activity:</span>{" "}
              <span className="text-gray-600">
                {latestTrackedActivityAt
                  ? formatDateTime(latestTrackedActivityAt)
                  : "No tracked activity yet"}
              </span>
            </div>
            {sessionUser.role === "SUPER_ADMIN" && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-700 mb-3">
                  <span className="font-medium">Generate a temp password.</span>{" "}
                  Use this to set up or recover portal access. Generating
                  invalidates any previously issued temp password.
                </p>
                <RevealTempPasswordButton employeeId={employee.id} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-6">
        <EmployeeDocumentsCard
          employeeId={employee.id}
          hasDriveFolder={!!employee.driveFolderId}
          isTerminated={isTerminated}
          handbookSigned={handbookSigned}
          ssCardNotNeeded={employee.ssCardNotNeeded}
          initialIssues={documentIssues.map((i) => ({
            id: i.id,
            category: i.category,
            note: i.note,
            flaggedBy: i.flaggedBy,
          }))}
          initialDocuments={employeeDocuments.map((d) => ({
            id: d.id,
            category: d.category,
            customName: d.customName,
            fileName: d.fileName,
            driveFileId: d.driveFileId,
            mimeType: d.mimeType,
            fileSize: d.fileSize,
            uploadedAt: d.uploadedAt.toISOString(),
            uploadedBy: d.uploadedBy,
          }))}
          topContent={
            <DriveFolderCard
              employeeId={employee.id}
              driveFolderId={employee.driveFolderId}
              webViewLink={driveFolderWebLink}
              driveEnabled={isDriveEnabled()}
              isStub={isStubId(employee.driveFolderId)}
              embedded
            />
          }
        >
          <EsignRequestsCard
            employeeId={employee.id}
            employeeHasEmail={!employee.email.endsWith("@placeholder.local")}
            employeeHasDriveFolder={!!employee.driveFolderId}
            isTerminated={isTerminated}
            signableDocuments={signableDocuments}
            initialRequests={esignRequests.map((r) => ({
              id: r.id,
              status: r.status,
              sentAt: r.sentAt.toISOString(),
              signedAt: r.signedAt ? r.signedAt.toISOString() : null,
              cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
              signedFileDriveId: r.signedFileDriveId,
              signableDocument: r.signableDocument,
              requestedBy: r.requestedBy ?? { id: "", name: "(removed)" },
              verifiedBy: r.verifiedBy,
            }))}
            embedded
          />
        </EmployeeDocumentsCard>
      </div>

      <div className="mt-6">
        <DangerZoneCard
          employeeId={employee.id}
          employeeName={employee.name}
          isTerminated={isTerminated}
          isSuperAdmin={sessionUser.role === "SUPER_ADMIN"}
          canEndEmployment={true}
        />
      </div>

      <div className="mt-6">
        <EmployeeModuleAssignments employeeId={employee.id} />
      </div>

      {/* Module progress */}
      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Module progress</h2>
          <p className="text-sm text-gray-500">
            Expand a module to review subsection and lesson completion details.
          </p>
        </CardHeader>
        <CardContent>
          <EmployeeModuleProgressTable modules={moduleProgressRows} />
        </CardContent>
      </Card>

      {/* Recent audit log */}
      <Card className="mt-8">
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Recent Activity</h2>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-gray-100">
            {recentAudit.map((log) => (
              <li key={log.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={log.action === "COMPLETED" ? "success" : "danger"}>
                    {log.action === "COMPLETED" ? "Completed" : "Uncompleted"}
                  </Badge>
                  <span className="text-sm text-gray-700">{log.lesson.title}</span>
                </div>
                <span className="text-xs text-gray-400">{formatDateTime(log.timestamp)}</span>
              </li>
            ))}
            {recentAudit.length === 0 && (
              <li className="px-6 py-4 text-sm text-gray-400 text-center">No activity yet</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
