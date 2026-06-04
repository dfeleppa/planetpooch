import { requireAuth } from "@/lib/auth-helpers";
import { cn } from "@/lib/utils";

type CareerStep = {
  title: string;
  modules: string[];
  type: "associate" | "management";
};

const careerSteps: CareerStep[] = [
  {
    title: "Daycare Associate",
    modules: ["General", "Daycare", "Boarding", "Enrichment"],
    type: "associate",
  },
  {
    title: "Resort Associate",
    modules: ["Opening/Closing", "Check-in"],
    type: "associate",
  },
  {
    title: "Senior Resort Associate",
    modules: ["Front Desk", "Sundays"],
    type: "associate",
  },
  {
    title: "Resort Shift Lead",
    modules: ["Shift Lead", "Evaluation"],
    type: "associate",
  },
  {
    title: "Assistant Manager",
    modules: ["SOPs"],
    type: "management",
  },
  {
    title: "Facility Manager",
    modules: ["FM SOPs"],
    type: "management",
  },
];

export default async function CareerPage() {
  await requireAuth();
  const topDownSteps = [...careerSteps].reverse();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="pp-h1">Career</h1>
        <p className="pp-sub">Role path and modules needed for each advancement.</p>
      </header>

      <section className="rounded-xl border border-pp-line bg-pp-surface px-4 py-5 shadow-sm sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-pp-ink">Role progression</h2>
            <p className="mt-1 text-sm text-pp-ink-3">Complete the red module card to advance into the matching role.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-pp-ink-3">
            <LegendSwatch fill="bg-[#e3f5ef]" border="border-[#75bba7]" label="Associate tiers (1-4)" />
            <LegendSwatch fill="bg-[#f0eeff]" border="border-[#a99df0]" label="Management roles" />
            <LegendSwatch fill="bg-[#fcede6]" border="border-[#df9b85]" label="Module to complete" />
          </div>
        </div>

        <div className="hidden lg:block">
          {topDownSteps.map((step, index) => {
            return (
              <div key={step.title}>
                <div className="grid grid-cols-[290px_96px_1fr] gap-x-0">
                  <div className="flex justify-center">
                    <RoleCard step={step} />
                  </div>
                  <div aria-hidden />
                  <div aria-hidden />
                </div>

                {index < topDownSteps.length - 1 ? (
                  <div className="grid grid-cols-[290px_96px_1fr] gap-x-0">
                    <div className="relative col-span-2 h-20">
                      <div className="absolute left-[145px] top-1/2 h-px w-[calc(100%-145px)] border-t border-dashed border-pp-line-2" />
                      <div className="absolute left-[145px] top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center">
                        <VerticalArrow className="h-16" />
                      </div>
                    </div>
                    <div className="flex h-20 items-center">
                      <ModuleCard step={step} />
                    </div>
                  </div>
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
        </div>
      </section>
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

function RoleCard({ step }: { step: CareerStep }) {
  const management = step.type === "management";

  return (
    <div
      className={cn(
        "flex min-h-[66px] w-full max-w-[260px] flex-col items-center justify-center rounded-lg border px-4 py-3 text-center",
        management
          ? "border-[#a99df0] bg-[#f0eeff] text-[#34308f]"
          : "border-[#75bba7] bg-[#e3f5ef] text-[#045950]"
      )}
    >
      <div className="text-sm font-bold">{step.title}</div>
      <div className="mt-1 text-xs font-medium">{step.modules.join(" · ")}</div>
    </div>
  );
}

function ModuleCard({ step, className }: { step: CareerStep; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[46px] w-full max-w-[420px] flex-col justify-center rounded-lg border border-[#df9b85] bg-[#fcede6] px-4 py-2.5 text-left text-[#7a2e18]",
        className
      )}
    >
      <div className="text-sm font-bold">{step.title}</div>
      <div className="mt-0.5 text-xs font-medium text-[#9a3918]">{step.modules.join(" · ")}</div>
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
