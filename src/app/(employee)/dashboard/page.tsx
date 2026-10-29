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
import { hasAskPoochAccess } from "@/lib/knowledge-access";

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
        ssCardNotNeeded: true,
        terminatedAt: true,
      },
    }),
    (async () => {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { jobTitle: true, company: true },
      });
      const ids = await getVisibleModuleIdsForUser(
        userId,
        me?.jobTitle ?? null,
        me?.company ?? null,
      );
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
      where: { userId },
      select: { lessonId: true, isCompleted: true, isOutOfDate: true },
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

  const completedSet = new Set(completions.filter((c) => c.isCompleted).map((c) => c.lessonId));

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

    return { ...mod, isOutOfDate: lessons.some((l) => completions.some((c) => c.lessonId === l.id && c.isOutOfDate)), totalLessons: total, completedLessons: completed, continueLesson };
  });

  const availabilityByDay = new Map(availability.map((a) => [a.dayOfWeek, a]));
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(new Date());
  const todayDay = DAYS_OF_WEEK.find((day) => day.label === todayLabel);
  const todayAvailability = todayDay ? availabilityByDay.get(todayDay.value) : null;
  const featuredModule = moduleProgress.find((mod) => mod.continueLesson && mod.completedLessons < mod.totalLessons);
  const featuredProgress = featuredModule && featuredModule.totalLessons > 0
    ? Math.round((featuredModule.completedLessons / featuredModule.totalLessons) * 100)
    : 0;
  const displayName = user?.firstName || session.user.name?.split(" ")[0] || "there";

  return (
    <div className="pp-today">
      <div className="pp-today-intro">
        <div>
          <p className="pp-eyebrow">Employee Dashboard · {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" }).format(new Date())}</p>
          <h1>Good to see you, {displayName}.</h1>
          <p>Pick up where you left off and see what matters today.</p>
        </div>
        {hasAskPoochAccess(user) && <Link className="pp-today-help" href="/knowledge"><span aria-hidden="true">✦</span> Ask Pooch <span aria-hidden="true">↗</span></Link>}
      </div>

      <section className="pp-today-feature-grid" aria-label="Today at a glance">
        <article className="pp-today-feature pp-today-feature-primary">
          <span className="pp-feature-icon" aria-hidden="true">↗</span>
          <p className="pp-eyebrow">Pick up where you left off</p>
          <h2>{featuredModule ? featuredModule.title : "Your learning"}</h2>
          {featuredModule ? (
            <>
              <p>{featuredModule.continueLesson?.title}</p>
              <div className="pp-feature-progress"><span style={{ width: `${featuredProgress}%` }} /></div>
              <div className="pp-feature-footer"><strong>{featuredProgress}% complete</strong><Link href={`/modules/${featuredModule.id}/lessons/${featuredModule.continueLesson?.id}`}>Continue <span aria-hidden="true">→</span></Link></div>
            </>
          ) : (
            <><p>{modules.length ? "Your assigned modules are complete." : "No modules are assigned yet."}</p><Link className="pp-feature-inline-link" href="/modules">View modules →</Link></>
          )}
        </article>
        <article className="pp-today-feature">
          <span className="pp-feature-icon" aria-hidden="true">✓</span>
          <p className="pp-eyebrow">Operations</p>
          <h2>Daily checklists</h2>
          <p>Open your checklists and see what needs to be done.</p>
          <Link className="pp-feature-inline-link" href="/maintenance/checklists">View checklists →</Link>
        </article>
        <article className="pp-today-feature">
          <span className="pp-feature-icon" aria-hidden="true">◷</span>
          <p className="pp-eyebrow">Your availability</p>
          <h2>{todayDay?.label || "Today"}</h2>
          <p>{todayAvailability ? `${formatTimeLabel(todayAvailability.startTime)} – ${formatTimeLabel(todayAvailability.endTime)}` : "No availability listed today"}</p>
          <a className="pp-feature-inline-link" href="#availability">View your week →</a>
        </article>
      </section>

      <div className="pp-today-main-grid">
        <section className="pp-today-panel" aria-labelledby="my-learning-heading">
          <div className="pp-today-panel-header"><div><p className="pp-eyebrow">Keep growing</p><h2 id="my-learning-heading">My learning</h2></div><Link href="/modules">View all →</Link></div>
          {moduleProgress.length ? <div className="pp-learning-list">{moduleProgress.map((mod) => (
            <div className="pp-learning-row" key={mod.id}>
              <div className="pp-learning-icon" aria-hidden="true">{mod.icon || "↗"}</div>
              <div className="pp-learning-copy"><Link href={`/modules/${mod.id}`}>{mod.title}</Link><p>{mod.description || `${mod.completedLessons} of ${mod.totalLessons} lessons complete`}</p><ProgressBar value={mod.completedLessons} max={mod.totalLessons} showLabel={false} size="sm" /></div>
              <div className="pp-learning-end"><span>{mod.isOutOfDate ? "Out of Date" : `${mod.totalLessons ? Math.round((mod.completedLessons / mod.totalLessons) * 100) : 0}%`}</span>{mod.continueLesson ? <Link href={`/modules/${mod.id}/lessons/${mod.continueLesson.id}`}>Continue</Link> : <span>{mod.totalLessons ? "Complete" : "Not started"}</span>}</div>
            </div>
          ))}</div> : <p className="pp-today-empty">No modules are assigned to you.</p>}
        </section>
        <section className="pp-today-panel" aria-labelledby="quick-actions-heading">
          <div className="pp-today-panel-header"><div><p className="pp-eyebrow">Employee tools</p><h2 id="quick-actions-heading">Explore your workspace</h2></div></div>
          <div className="pp-quick-actions">
            <Link href="/modules"><span className="pp-quick-icon" aria-hidden="true">❏</span><span><strong>Modules</strong><small>Browse your assigned training</small></span><span aria-hidden="true">→</span></Link>
            {(user?.company === "RESORT" || user?.company === "CORPORATE") && (
              <Link href="/career"><span className="pp-quick-icon" aria-hidden="true">↗</span><span><strong>Career</strong><small>See your growth path</small></span><span aria-hidden="true">→</span></Link>
            )}
            <Link href="/maintenance/checklists"><span className="pp-quick-icon" aria-hidden="true">✓</span><span><strong>Daily checklists</strong><small>Open your assigned checklists</small></span><span aria-hidden="true">→</span></Link>
            <a href="#employee-documents"><span className="pp-quick-icon" aria-hidden="true">▤</span><span><strong>Documents</strong><small>View your employee files</small></span><span aria-hidden="true">→</span></a>
            {hasAskPoochAccess(user) && <Link href="/knowledge"><span className="pp-quick-icon" aria-hidden="true">✦</span><span><strong>Ask Pooch</strong><small>Find answers and guidance</small></span><span aria-hidden="true">→</span></Link>}
            <a href="#availability"><span className="pp-quick-icon" aria-hidden="true">◷</span><span><strong>Availability</strong><small>View your weekly availability</small></span><span aria-hidden="true">→</span></a>
            <a href="#employee-info"><span className="pp-quick-icon" aria-hidden="true">◉</span><span><strong>Employee info</strong><small>Review your details</small></span><span aria-hidden="true">→</span></a>
          </div>
        </section>
      </div>

      <div className="pp-today-details">
        {user && <section id="employee-info"><Card><CardHeader><h2 className="font-semibold text-pp-ink">Employee info</h2></CardHeader><CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><Field label="First name" value={user.firstName} /><Field label="Last name" value={user.lastName} /><Field label="Email" value={user.email.endsWith("@placeholder.local") ? "— (not set)" : user.email} /><Field label="Phone" value={user.phone || "—"} /><Field label="Role" value={user.role} /><Field label="Company" value={COMPANY_LABELS[user.company]} /><Field label="Job title" value={user.jobTitle || "—"} /><Field label="Hire date" value={user.hireDate ? user.hireDate.toISOString().slice(0, 10) : "—"} /></CardContent></Card></section>}
        <section id="availability"><Card><CardHeader><h2 className="font-semibold text-pp-ink">Weekly availability</h2></CardHeader><CardContent className="p-0"><ul className="divide-y divide-pp-line">{DAYS_OF_WEEK.map((day) => { const entry = availabilityByDay.get(day.value); return <li key={day.value} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm"><span className="text-pp-ink">{day.label}</span><span className={entry ? "text-pp-ink-2" : "text-pp-ink-4"}>{entry ? `${formatTimeLabel(entry.startTime)} – ${formatTimeLabel(entry.endTime)}` : "Unavailable"}</span></li>; })}</ul></CardContent></Card></section>
      </div>
      {user && <section id="employee-documents" className="mt-6"><EmployeeDocumentsCard employeeId={user.id} hasDriveFolder={!!user.driveFolderId} isTerminated={!!user.terminatedAt} handbookSigned={handbookSigned} ssCardNotNeeded={user.ssCardNotNeeded} initialIssues={[]} initialDocuments={employeeDocuments.map((d) => ({ id: d.id, category: d.category, customName: d.customName, fileName: d.fileName, driveFileId: d.driveFileId, mimeType: d.mimeType, fileSize: d.fileSize, uploadedAt: d.uploadedAt.toISOString(), uploadedBy: d.uploadedBy }))} /></section>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-pp-ink-4 uppercase tracking-wide">{label}</div>
      <div className="text-pp-ink mt-0.5">{value}</div>
    </div>
  );
}
