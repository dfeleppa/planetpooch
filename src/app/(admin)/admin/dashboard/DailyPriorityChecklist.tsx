"use client";

import { useEffect, useMemo, useState } from "react";

const ITEMS = [
  "Daycare report",
  "30/60 texting list",
  "Kim - thanksgiving/xmas boarding reach outs (repeats), mention thanksgiving or xmas",
  "Push inhouse grooming - gameplan on monday",
  "review hours and approve payroll",
  "nest power connector",
] as const;

export function DailyPriorityChecklist({ dateKey }: { dateKey: string }) {
  const storageKey = `admin-dashboard-daily-priorities:${dateKey}`;
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setCompleted(saved ? JSON.parse(saved) as Record<string, boolean> : {});
    } catch {
      setCompleted({});
    }
  }, [storageKey]);

  const completedCount = useMemo(
    () => ITEMS.filter((item) => completed[item]).length,
    [completed]
  );

  function toggle(item: string) {
    setCompleted((current) => {
      const next = { ...current, [item]: !current[item] };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // The checklist still works for this page view if storage is unavailable.
      }
      return next;
    });
  }

  return (
    <section aria-labelledby="daily-priorities-heading" className="rounded-xl border border-pp-line bg-pp-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pp-line px-5 py-4">
        <div>
          <h2 id="daily-priorities-heading" className="text-sm font-semibold text-pp-ink">Daily checklist</h2>
          <p className="mt-1 text-xs text-pp-ink-3">Resets each day · {completedCount} of {ITEMS.length} complete</p>
        </div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-pp-bg-2" role="progressbar" aria-label="Daily checklist completion" aria-valuemin={0} aria-valuemax={ITEMS.length} aria-valuenow={completedCount}>
          <div className="h-full rounded-full bg-pp-accent transition-[width]" style={{ width: `${completedCount / ITEMS.length * 100}%` }} />
        </div>
      </div>
      <ul className="grid gap-px bg-pp-line sm:grid-cols-2">
        {ITEMS.map((item) => {
          const checked = Boolean(completed[item]);
          return (
            <li key={item} className="bg-pp-surface">
              <label className="flex min-h-14 cursor-pointer items-start gap-3 px-5 py-4 hover:bg-pp-surface-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-pp-accent"
                />
                <span className={`text-sm leading-5 ${checked ? "text-pp-ink-4 line-through" : "text-pp-ink"}`}>{item}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
