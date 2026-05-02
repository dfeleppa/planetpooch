import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import Link from "next/link";
import { Company } from "@prisma/client";
import { DAYS_OF_WEEK, formatTimeLabel } from "@/lib/availability";
import { HANDBOOK_SIGNABLE_NAME } from "@/lib/employee-documents";
import { EmployeeDocumentsCard } from "@/components/EmployeeDocumentsCard";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";

const COMPANY_LABELS: Record<Company, string> = {
  GROOMING: "Planet Pooch Grooming",
  RESORT: "Planet Pooch Resort",
  CORPORATE: "Planet Pooch Corporate",
};

export default async function DashboardPage() {
  const session = await requireAuth();
  const userId = session.user.id;

  const [user, modules, completions, availability, employeeDocuments, handbookEsignRequests] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
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
        terminatedAt: true,
      },
    }),
    (async () => {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { jobTitle: true },
      });
      const ids = await getVisibleModuleIdsForUser(userId, me?.jobTitle ?? null);
      return prisma.module.findMany({
        where: { id: { in: [...ids] } },
        orderBy: { order: "asc" },
        include: {
          subsections: {
            include: {
              lessons: { select: { id: true, title: true } },
            },
          },
        },
      });
    })(),
    prisma.lessonCompletion.findMany({
      where: { userId, isCompleted: true },
      select: { lessonId: true },
    }),
    prisma.employeeAvailability.findMany({
      where: { userId },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    }),
    prisma.employeeDocument.findMany({
      where: { userId },
      orderBy: { uploadedAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.esignRequest.findMany({
      where: {
        userId,
        status: "SIGNED",
        signableDocument: { name: HANDBOOK_SIGNABLE_NAME },
      },
      select: { id: true },
      take: 1,
    }),
  ]);

  const handbookSigned = handbookEsignRequests.length > 0;

  const completedSet = new Set(completions.map((c) => c.lessonId));

  const moduleProgress = modules.map((mod) => {
    const lessons = mod.subsections.flatMap((s) => s.lessons);
    const total = lessons.length;
    const completed = lessons.filter((l) => completedSet.has(l.id)).length;

    let continueLesson: { id: string; title: string } | null = null;
    for (const sub of mod.subsections) {
      for (const lesson of sub.lessons) {
        if (!completedSet.has(lesson.id)) {
          continueLesson = lesson;
          break;
        }
      }
      if (continueLesson) break;
    }

    return { ...mod, totalLessons: total, completedLessons: completed, continueLesson };
  });

  const availabilityByDay = new Map(availability.map((a) => [a.dayOfWeek, a]));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-gray-500 mt-1">Welcome back, {session.user.name}</p>

      <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-4">Your Modules</h2>
      <div className="grid gap-4">
        {moduleProgress.map((mod) => (
          <Card key={mod.id} className="hover:shadow-md transition-shadow">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {mod.icon && <span className="text-xl flex-shrink-0">{mod.icon}</span>}
                    <Link href={`/modules/${mod.id}`} className="text-lg font-medium text-gray-900 hover:text-blue-600 break-words">
                      {mod.title}
                    </Link>
                  </div>
                  {mod.description && (
                    <p className="text-sm text-gray-500 mt-1">{mod.description}</p>
                  )}
                  <ProgressBar value={mod.completedLessons} max={mod.totalLessons} className="mt-3" />
                </div>
                {mod.continueLesson && mod.completedLessons < mod.totalLessons && (
                  <Link
                    href={`/modules/${mod.id}/lessons/${mod.continueLesson.id}`}
                    className="self-start sm:self-auto sm:ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Continue
                  </Link>
                )}
                {mod.completedLessons === mod.totalLessons && mod.totalLessons > 0 && (
                  <span className="self-start sm:self-auto sm:ml-4 px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-lg">
                    Complete!
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {modules.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No modules available yet. Check back soon!
            </CardContent>
          </Card>
        )}
      </div>

      {user && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Employee Info</h2>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Field label="First Name" value={user.firstName} />
            <Field label="Last Name" value={user.lastName} />
            <Field
              label="Email"
              value={
                user.email.endsWith("@placeholder.local")
                  ? "— (not set)"
                  : user.email
              }
            />
            <Field label="Phone" value={user.phone || "—"} />
            <Field label="Role" value={user.role} />
            <Field label="Company" value={COMPANY_LABELS[user.company]} />
            <Field label="Job Title" value={user.jobTitle || "—"} />
            <Field
              label="Hire Date"
              value={user.hireDate ? user.hireDate.toISOString().slice(0, 10) : "—"}
            />
          </CardContent>
        </Card>
      )}

      {user && (
        <div className="mt-6">
          <EmployeeDocumentsCard
            employeeId={user.id}
            hasDriveFolder={!!user.driveFolderId}
            isTerminated={!!user.terminatedAt}
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
      )}

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

    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
