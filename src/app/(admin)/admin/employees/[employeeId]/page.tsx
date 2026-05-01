import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Company, Role } from "@prisma/client";
import { EditEmployeeForm } from "./EditEmployeeForm";
import { EsignRequestsCard } from "./EsignRequestsCard";
import { DriveFolderCard } from "./DriveFolderCard";
import { EmployeeDocumentsCard } from "@/components/EmployeeDocumentsCard";
import { DangerZoneCard } from "./DangerZoneCard";
import { DAYS_OF_WEEK, formatTimeLabel } from "@/lib/availability";
import { getFileWebLink, isDriveEnabled, isStubId } from "@/lib/drive";
import { formatDate } from "@/lib/utils";
import { HANDBOOK_SIGNABLE_NAME } from "@/lib/employee-documents";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const session = await requireManager();
  const sessionUser = session.user as { role: Role; company: Company };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  const { employeeId } = await params;

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
      createdAt: true,
      terminatedAt: true,
      terminationReason: true,
      terminatedBy: { select: { id: true, name: true } },
    },
  });

  if (!employee) notFound();
  if (companyFilter.company && employee.company !== companyFilter.company) notFound();
  if (sessionUser.role === "MANAGER" && employee.role !== "EMPLOYEE") notFound();

  const modules = await prisma.module.findMany({
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

  const recentAudit = await prisma.completionAuditLog.findMany({
    where: { userId: employeeId },
    orderBy: { timestamp: "desc" },
    take: 20,
    include: { lesson: { select: { title: true } } },
  });

  const [signableDocuments, esignRequests, availability, employeeDocuments] = await Promise.all([
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
  ]);

  const availabilityByDay = new Map(availability.map((a) => [a.dayOfWeek, a]));

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
          canEditCompany={sessionUser.role !== "MANAGER"}
          canAssignSuperAdmin={sessionUser.role === "SUPER_ADMIN"}
          canEditRole={sessionUser.role === "SUPER_ADMIN"}
        />
      </div>

      <div className="mt-6">
        <DriveFolderCard
          employeeId={employee.id}
          driveFolderId={employee.driveFolderId}
          webViewLink={driveFolderWebLink}
          driveEnabled={isDriveEnabled()}
          isStub={isStubId(employee.driveFolderId)}
        />
      </div>

      <div className="mt-6">
        <EmployeeDocumentsCard
          employeeId={employee.id}
          hasDriveFolder={!!employee.driveFolderId}
          isTerminated={isTerminated}
          handbookSigned={handbookSigned}
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
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Availability</h2>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-gray-100">
            {DAYS_OF_WEEK.map((day) => {
              const entry = availabilityByDay.get(day.value);
              return (
                <li
                  key={day.value}
                  className="flex items-center justify-between px-6 py-2 text-sm"
                >
                  <span className="text-gray-900">{day.label}</span>
                  {entry ? (
                    <span className="text-gray-600">
                      {formatTimeLabel(entry.startTime)} – {formatTimeLabel(entry.endTime)}
                    </span>
                  ) : (
                    <span className="text-gray-400">Unavailable</span>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="mt-6">
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
          }))}
        />
      </div>

      <div className="mt-6">
        <DangerZoneCard
          employeeId={employee.id}
          employeeName={employee.name}
          isTerminated={isTerminated}
          isSuperAdmin={sessionUser.role === "SUPER_ADMIN"}
        />
      </div>

      {/* Module progress */}
      <div className="space-y-6 mt-6">
        {modules.map((mod) => {
          const allLessons = mod.subsections.flatMap((s) => s.lessons);
          const total = allLessons.length;
          const completed = allLessons.filter((l) => completionMap.get(l.id)?.isCompleted).length;

          return (
            <Card key={mod.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">{mod.title}</h2>
                  <Badge variant={completed === total && total > 0 ? "success" : completed > 0 ? "warning" : "default"}>
                    {total > 0 ? Math.round((completed / total) * 100) : 0}%
                  </Badge>
                </div>
                <ProgressBar value={completed} max={total} className="mt-2" />
              </CardHeader>
              <CardContent className="p-0">
                {mod.subsections.map((sub) => (
                  <div key={sub.id}>
                    <div className="px-6 py-2 bg-gray-50 text-sm font-medium text-gray-600">
                      {sub.title}
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {sub.lessons.map((lesson) => {
                        const comp = completionMap.get(lesson.id);
                        return (
                          <li key={lesson.id} className="flex items-center justify-between px-6 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                comp?.isCompleted ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                              }`}>
                                {comp?.isCompleted && (
                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              <span className="text-sm text-gray-700">{lesson.title}</span>
                            </div>
                            {comp?.isCompleted && comp.completedAt && (
                              <span className="text-xs text-gray-400">
                                {formatDateTime(comp.completedAt)}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

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
