import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/utils";

type CareerStep = {
  title: string;
  summary: string[];
  type: "associate" | "management";
  lessonsToAdvance: number | null;
  moduleTitle: string | null;
  moduleKeywords: string[];
};

const careerSteps: CareerStep[] = [
  {
    title: "Daycare Associate",
    summary: ["General", "Daycare", "Boarding", "Enrichment"],
    type: "associate",
    lessonsToAdvance: 3,
    moduleTitle: "Resort Associate",
    moduleKeywords: ["opening", "closing", "check-in", "check in"],
  },
  {
    title: "Resort Associate",
    summary: ["Opening/Closing", "Check-in"],
    type: "associate",
    lessonsToAdvance: 6,
    moduleTitle: "Senior Resort Associate",
    moduleKeywords: ["front desk", "sundays", "senior resort"],
  },
  {
    title: "Senior Resort Associate",
    summary: ["Front Desk", "Sundays"],
    type: "associate",
    lessonsToAdvance: 2,
    moduleTitle: "Resort Shift Lead",
    moduleKeywords: ["shift lead", "evaluation"],
  },
  {
    title: "Resort Shift Lead",
    summary: ["Shift Lead", "Evaluation"],
    type: "associate",
    lessonsToAdvance: 1,
    moduleTitle: "Assistant Manager",
    moduleKeywords: ["assistant manager", "sop"],
  },
  {
    title: "Assistant Manager",
    summary: ["SOPs"],
    type: "management",
    lessonsToAdvance: 1,
    moduleTitle: "Facility Manager",
    moduleKeywords: ["facility manager", "fm sop"],
  },
  {
    title: "Facility Manager",
    summary: ["FM SOPs"],
    type: "management",
    lessonsToAdvance: null,
    moduleTitle: null,
    moduleKeywords: [],
  },
];

export default async function CareerPage() {
  const session = await requireAuth();
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jobTitle: true },
  });

  const visibleIds = await getVisibleModuleIdsForUser(userId, user?.jobTitle ?? null);
  const [modules, completions] = await Promise.all([
    prisma.module.findMany({
      where: { id: { in: [...visibleIds] } },
      orderBy: { order: "asc" },
      include: {
        subsections: {
          include: {
            lessons: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.lessonCompletion.findMany({
      where: { userId, isCompleted: true },
      select: { lessonId: true },
    }),
  ]);

  const completedLessonIds = new Set(completions.map((completion) => completion.lessonId));
  const currentIndex = findCurrentStepIndex(user?.jobTitle ?? "");
  const nextStep = currentIndex >= 0 ? careerSteps[currentIndex + 1] : careerSteps[1];
  const currentStep = currentIndex >= 0 ? careerSteps[currentIndex] : careerSteps[0];
  const nextModuleProgress = nextStep ? getStepModuleProgress(nextStep, modules, completedLessonIds) : null;
  const completedSteps = careerSteps.filter((_, index) => currentIndex >= 0 && index <= currentIndex).length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="pp-h1">Career</h1>
          <p className="pp-sub">
            Your role path, advancement modules, and progress toward the next step.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Current role" value={currentStep.title} />
          <Metric label="Path progress" value={`${completedSteps}/${careerSteps.length}`} />
          <Metric label="Next step" value={nextStep?.title ?? "Top tier"} />
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <div className="rounded-xl border border-pp-line bg-pp-surface p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pp-ink">Role progression</h2>
              <p className="mt-1 text-sm text-pp-ink-3">Resort associate track through management.</p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-pp-ink-3">
              <LegendSwatch fill="bg-[#e3f5ef]" border="border-[#75bba7]" label="Associate tiers" />
              <LegendSwatch fill="bg-[#f0eeff]" border="border-[#a99df0]" label="Management" />
              <LegendSwatch fill="bg-[#fcedE6]" border="border-[#df9b85]" label="Advancement module" />
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(230px,0.95fr)_28px_minmax(250px,1fr)]">
            {[...careerSteps].reverse().map((step, reverseIndex) => {
              const originalIndex = careerSteps.length - 1 - reverseIndex;
              const progress = getStepModuleProgress(step, modules, completedLessonIds);
              const isCurrent = originalIndex === currentIndex;
              const isEarned = currentIndex >= 0 && originalIndex <= currentIndex;

              return (
                <div key={step.title} className="contents">
                  <RoleCard step={step} isCurrent={isCurrent} isEarned={isEarned} />
                  <div className="hidden items-center lg:flex">
                    {step.moduleTitle ? <div className="h-px w-full border-t border-dashed border-pp-line-2" /> : null}
                  </div>
                  {step.moduleTitle ? (
                    <ModuleCard step={step} progress={progress} />
                  ) : (
                    <div className="hidden lg:block" />
                  )}
                  {reverseIndex < careerSteps.length - 1 ? (
                    <>
                      <div className="hidden justify-center lg:flex">
                        <span className="text-lg leading-none text-pp-ink-4">^</span>
                      </div>
                      <div className="hidden lg:block" />
                      <div className="hidden lg:block" />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-pp-line bg-pp-surface p-5 shadow-sm">
            <h2 className="text-base font-semibold text-pp-ink">Next advancement</h2>
            {nextStep && nextModuleProgress ? (
              <div className="mt-4">
                <p className="text-sm text-pp-ink-3">Complete the {nextStep.title} module path.</p>
                <div className="mt-4 rounded-lg border border-[#df9b85] bg-[#fcede6] p-4">
                  <div className="text-sm font-semibold text-[#7a2e18]">{nextStep.title}</div>
                  <div className="mt-1 text-sm text-[#9a3918]">
                    {nextModuleProgress.completed} / {nextModuleProgress.total} lessons complete
                  </div>
                  <ProgressBar value={nextModuleProgress.completed} max={Math.max(nextModuleProgress.total, 1)} className="mt-3" />
                  {nextModuleProgress.moduleHref ? (
                    <Link
                      href={nextModuleProgress.moduleHref}
                      className="mt-4 inline-flex rounded-md bg-pp-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-pp-accent-2"
                    >
                      Open module
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-pp-ink-3">You are at the top of this path.</p>
            )}
          </div>

          <div className="rounded-xl border border-pp-line bg-pp-surface p-5 shadow-sm">
            <h2 className="text-base font-semibold text-pp-ink">Milestones</h2>
            <ol className="mt-4 space-y-3">
              {careerSteps.map((step, index) => (
                <li key={step.title} className="flex gap-3 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border text-[11px]",
                      currentIndex >= 0 && index <= currentIndex
                        ? "border-pp-ok-line bg-pp-ok-bg text-pp-ok"
                        : "border-pp-line bg-pp-bg text-pp-ink-4"
                    )}
                  >
                    {currentIndex >= 0 && index <= currentIndex ? "✓" : index + 1}
                  </span>
                  <div>
                    <div className="font-medium text-pp-ink">{step.title}</div>
                    <div className="text-pp-ink-3">{step.summary.join(" · ")}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[128px] rounded-lg border border-pp-line bg-pp-surface px-3 py-2 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-pp-ink">{value}</div>
    </div>
  );
}

function LegendSwatch({ fill, border, label }: { fill: string; border: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-3.5 w-3.5 rounded border", fill, border)} />
      {label}
    </span>
  );
}

function RoleCard({ step, isCurrent, isEarned }: { step: CareerStep; isCurrent: boolean; isEarned: boolean }) {
  const management = step.type === "management";

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-center shadow-sm transition-colors",
        management
          ? "border-[#a99df0] bg-[#f0eeff] text-[#34308f]"
          : "border-[#75bba7] bg-[#e3f5ef] text-[#045950]",
        isCurrent && "ring-2 ring-pp-accent ring-offset-2",
        !isEarned && "opacity-70"
      )}
    >
      <div className="text-sm font-bold">{step.title}</div>
      <div className="mt-1 text-xs font-medium">{step.summary.join(" · ")}</div>
      {isCurrent ? (
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-pp-accent">Current</div>
      ) : null}
    </div>
  );
}

function ModuleCard({
  step,
  progress,
}: {
  step: CareerStep;
  progress: { completed: number; total: number; moduleHref: string | null };
}) {
  return (
    <div className="rounded-lg border border-[#df9b85] bg-[#fcede6] px-4 py-3 text-left text-[#7a2e18] shadow-sm">
      <div className="text-sm font-bold">{step.moduleTitle}</div>
      <div className="mt-1 text-xs text-[#9a3918]">
        {progress.total > 0
          ? `${progress.completed} / ${progress.total} lessons complete`
          : `${step.lessonsToAdvance} lesson${step.lessonsToAdvance === 1 ? "" : "s"} to advance`}
      </div>
      {progress.total > 0 ? <ProgressBar value={progress.completed} max={progress.total} className="mt-2" /> : null}
    </div>
  );
}

function findCurrentStepIndex(jobTitle: string) {
  const normalizedJobTitle = normalize(jobTitle);
  const exactIndex = careerSteps.findIndex((step) => normalize(step.title) === normalizedJobTitle);
  if (exactIndex >= 0) return exactIndex;
  return careerSteps.findIndex((step) => normalizedJobTitle.includes(normalize(step.title)));
}

function getStepModuleProgress(
  step: CareerStep,
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    subsections: Array<{ lessons: Array<{ id: string; title: string }> }>;
  }>,
  completedLessonIds: Set<string>
) {
  const matchingModule = modules.find((module) => {
    const haystack = normalize(`${module.title} ${module.description ?? ""}`);
    return step.moduleKeywords.some((keyword) => haystack.includes(normalize(keyword)));
  });

  if (!matchingModule) {
    return {
      completed: 0,
      total: step.lessonsToAdvance ?? 0,
      moduleHref: null,
    };
  }

  const lessons = matchingModule.subsections.flatMap((subsection) => subsection.lessons);
  return {
    completed: lessons.filter((lesson) => completedLessonIds.has(lesson.id)).length,
    total: lessons.length,
    moduleHref: `/modules/${matchingModule.id}`,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
