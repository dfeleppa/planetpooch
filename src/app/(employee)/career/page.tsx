import { requireAuth } from "@/lib/auth-helpers";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

type CareerStep = {
  title: string;
  modules: string[];
  moduleTitleMatches: string[];
  type: "associate" | "management";
};

type ModuleStatus = "inactive" | "active" | "complete";

type CareerStepWithStatus = CareerStep & {
  status: ModuleStatus;
  progressLabel: string;
};

const careerSteps: CareerStep[] = [
  {
    title: "Daycare Associate",
    modules: ["General", "Daycare", "Boarding", "Enrichment"],
    moduleTitleMatches: ["daycare associate"],
    type: "associate",
  },
  {
    title: "Resort Associate",
    modules: ["Opening/Closing", "Check-in"],
    moduleTitleMatches: ["resort associate", "opening closing", "check in"],
    type: "associate",
  },
  {
    title: "Senior Resort Associate",
    modules: ["Front Desk", "Sundays"],
    moduleTitleMatches: ["senior resort associate", "front desk", "sundays"],
    type: "associate",
  },
  {
    title: "Resort Shift Lead",
    modules: ["Shift Lead", "Evaluation"],
    moduleTitleMatches: ["resort shift lead", "shift lead", "evaluation"],
    type: "associate",
  },
  {
    title: "Assistant Manager",
    modules: ["SOPs"],
    moduleTitleMatches: ["assistant manager sops", "assistant manager"],
    type: "management",
  },
  {
    title: "Facility Manager",
    modules: ["FM SOPs"],
    moduleTitleMatches: ["facility manager fm sops", "facility manager", "fm sops"],
    type: "management",
  },
];

const advanceSteps = [
  {
    title: "Master your current tier",
    description: "Show up, do the work well, become someone the team counts on.",
  },
  {
    title: "Tell your manager",
    description: "Let us know you want to grow. We'll work with you.",
  },
  {
    title: "Train into the new skills",
    description: "Each tier has specific capabilities. We'll teach you - you put in the effort.",
  },
  {
    title: "Earn the trust",
    description: "Promotions reflect trust. Handle things well and you'll be next.",
  },
  {
    title: "Make it official",
    description: "When you're ready and a spot opens, we make the move together.",
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
      include: {
        subsections: {
          include: {
            lessons: { select: { id: true } },
          },
        },
      },
    }),
    prisma.lessonCompletion.findMany({
      where: { userId, isCompleted: true },
      select: { lessonId: true },
    }),
  ]);

  const completedSet = new Set(completions.map((completion) => completion.lessonId));
  const moduleProgress = modules.map((mod) => {
    const lessons = mod.subsections.flatMap((subsection) => subsection.lessons);
    const completedLessons = lessons.filter((lesson) => completedSet.has(lesson.id)).length;

    return {
      id: mod.id,
      normalizedTitle: normalizeModuleTitle(mod.title),
      totalLessons: lessons.length,
      completedLessons,
    };
  });

  const stepsWithStatus = careerSteps.map((step) => {
    const matchingModules = moduleProgress.filter((mod) =>
      step.moduleTitleMatches.some((match) => moduleTitleMatches(mod.normalizedTitle, match)),
    );

    const totalLessons = matchingModules.reduce((total, mod) => total + mod.totalLessons, 0);
    const completedLessons = matchingModules.reduce((total, mod) => total + mod.completedLessons, 0);
    const status: ModuleStatus =
      totalLessons > 0 && completedLessons === totalLessons
        ? "complete"
        : completedLessons > 0
          ? "active"
          : "inactive";

    return {
      ...step,
      status,
      progressLabel:
        totalLessons > 0
          ? `${completedLessons}/${totalLessons}`
          : "N/A",
    };
  });
  const topDownSteps = [...stepsWithStatus].reverse();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="pp-h1">Career</h1>
        <p className="pp-sub">Role path and modules needed for each advancement.</p>
      </header>

      <section className="rounded-xl border border-pp-line bg-pp-surface px-4 py-5 shadow-sm sm:px-6">
        <div className="mb-5">
          <div>
            <h2 className="text-base font-semibold text-pp-ink">Role progression</h2>
            <p className="mt-1 text-sm text-pp-ink-3">Complete the red module card to advance into the matching role.</p>
          </div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-[290px_72px_300px_minmax(240px,1fr)] lg:gap-x-4">
          <div className="col-start-4 row-start-1 row-span-[11]">
            <HowToAdvance />
          </div>

          {topDownSteps.map((step, index) => {
            return (
              <div key={step.title} className="contents">
                <div className="col-start-1 flex justify-center">
                  <RoleCard step={step} />
                </div>
                <div className="col-start-2" aria-hidden />
                <div className="col-start-3" aria-hidden />

                {index < topDownSteps.length - 1 ? (
                  <>
                    <div className="relative col-span-2 h-20">
                      <div className="absolute left-[145px] right-[-1rem] top-1/2 h-px border-t border-dashed border-pp-line-2" />
                      <div className="absolute left-[145px] top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center">
                        <VerticalArrow className="h-16" />
                      </div>
                    </div>
                    <div className="flex h-20 items-center">
                      <ModuleCard step={step} />
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 lg:hidden">
          {topDownSteps.map((step, index) => {
            return (
              <div key={step.title}>
                <RoleCard step={step} />
                {index < topDownSteps.length - 1 ? (
                  <>
                    <div className="flex h-10 items-center justify-center">
                      <VerticalArrow className="h-9" />
                    </div>
                    <ModuleCard step={step} className="mt-1" />
                  </>
                ) : null}
              </div>
            );
          })}
          <HowToAdvance className="mt-5" />
        </div>

        <Legend />
      </section>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-pp-line pt-4 text-xs text-pp-ink-3">
      <div className="flex flex-wrap gap-3">
        <LegendSwatch fill="bg-[#e5f3ff]" border="border-[#6ba8d8]" label="Associate tiers (1-4)" />
        <LegendSwatch fill="bg-[#f0eeff]" border="border-[#a99df0]" label="Management roles" />
      </div>
      <div className="flex flex-wrap gap-3">
        <LegendSwatch fill="bg-[#fff4d8]" border="border-[#d7a531]" label="Active" />
        <LegendSwatch fill="bg-[#e6f6ea]" border="border-[#69ad7a]" label="Complete" />
        <LegendSwatch fill="bg-[#f5f5f4]" border="border-[#d6d3d1]" label="Not active" />
      </div>
    </div>
  );
}

function HowToAdvance({ className }: { className?: string }) {
  return (
    <aside className={cn("border-t border-pp-line pt-4 text-pp-ink lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0", className)}>
      <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-pp-ink">How to advance</h3>
      <ol className="mt-4 grid gap-4">
        {advanceSteps.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[1.75rem_1fr] gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#6ba8d8] bg-[#e5f3ff] text-xs font-bold text-[#075985]">
              {index + 1}
            </div>
            <div>
              <div className="text-sm font-semibold leading-snug text-pp-ink">{step.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-pp-ink-3">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
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

function RoleCard({ step }: { step: CareerStepWithStatus }) {
  const management = step.type === "management";

  return (
    <div
      className={cn(
        "flex min-h-[66px] w-full max-w-[260px] flex-col items-center justify-center rounded-lg border px-4 py-3 text-center",
        management
          ? "border-[#a99df0] bg-[#f0eeff] text-[#34308f]"
          : "border-[#6ba8d8] bg-[#e5f3ff] text-[#075985]"
      )}
    >
      <div className="text-sm font-bold">{step.title}</div>
    </div>
  );
}

function ModuleCard({ step, className }: { step: CareerStepWithStatus; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[54px] w-full max-w-[300px] flex-col justify-center rounded-lg border px-3 py-2.5 text-left",
        step.status === "complete" && "border-[#69ad7a] bg-[#e6f6ea] text-[#246239]",
        step.status === "active" && "border-[#d7a531] bg-[#fff4d8] text-[#7a5312]",
        step.status === "inactive" && "border-[#d6d3d1] bg-[#f5f5f4] text-[#78716c]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold">{step.title}</div>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase leading-tight">
          {step.status === "complete" ? "Complete" : step.status === "active" ? "Active" : "Not active"}
        </span>
      </div>
      <ModuleList modules={step.modules} className="mt-1" />
      <div className="mt-1 text-[11px] font-semibold leading-tight opacity-80">{step.progressLabel}</div>
    </div>
  );
}

function ModuleList({ modules, className }: { modules: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 text-xs font-medium leading-tight", className)}>
      {modules.map((module) => (
        <span key={module}>{module}</span>
      ))}
    </div>
  );
}

function VerticalArrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 64"
      className={cn("w-6 text-pp-ink-4", className)}
      fill="none"
    >
      <path d="M12 62V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.5 14 12 7l5.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeModuleTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function moduleTitleMatches(normalizedTitle: string, match: string) {
  const normalizedMatch = normalizeModuleTitle(match);

  return normalizedTitle.includes(normalizedMatch) || normalizedMatch.includes(normalizedTitle);
}
