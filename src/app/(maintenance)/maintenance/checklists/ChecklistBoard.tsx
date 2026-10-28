"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SortableList, DragHandle, SortableHandleProps } from "@/components/SortableList";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Period = "DAILY" | "WEEKLY";

interface Completion {
  canUncheck: boolean;
  completedAt: string;
  completedByName: string | null;
}

interface ChecklistItem {
  id: string;
  period: Period;
  dueWeekday?: number | null;
  completionDate?: string;
  title: string;
  order: number;
  isActive: boolean;
  completion: Completion | null;
  dualCheck?: boolean;
  amCompletion?: Completion | null;
  pmCompletion?: Completion | null;
}

interface DaySummary {
  dailyDone: number;
}

interface SummaryData {
  dailyTotal: number;
  days: Record<string, DaySummary>;
}

// ── Local-date helpers ──────────────────────────────────────────────────────
// All dates are plain "YYYY-MM-DD" strings in the facility's local timezone.
// new Date("YYYY-MM-DD") parses as UTC midnight, which shifts a day in US
// timezones — so parsing goes through parseDate instead.

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const PERIODS: {
  period: Period;
  label: string;
  sublabel: string;
  icon: string;
  iconClass: string;
}[] = [
  {
    period: "DAILY",
    label: "Daily",
    sublabel: "Daily checklist",
    icon: "☀",
    iconClass: "bg-amber-50 text-amber-500",
  },
  {
    period: "WEEKLY",
    label: "Weekly",
    sublabel: "Sign off once per week · Sunday–Saturday",
    icon: "✓",
    iconClass: "bg-emerald-50 text-emerald-600",
  },
];

const DEPARTMENTS = [
  { value: "BOARDING", label: "Boarding" },
  { value: "GROOMING", label: "Grooming" },
  { value: "FRONT_DESK", label: "Front Desk" },
  { value: "MANAGEMENT", label: "Management" },
] as const;
type Department = (typeof DEPARTMENTS)[number]["value"];

export function ChecklistBoard({ canEdit, departments }: { canEdit: boolean; departments: readonly Department[] }) {
  const [department, setDepartment] = useState<Department>(departments[0]);
  return <div>
    <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Checklist department">
      {DEPARTMENTS.filter(({ value }) => departments.includes(value)).map(({ value, label }) => <button key={value} type="button"
        aria-pressed={department === value} onClick={() => setDepartment(value)}
        className={cn("min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
          department === value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
        {label}
      </button>)}
    </div>
    <DepartmentChecklistBoard key={department} department={department} canEdit={canEdit} />
  </div>;
}

function DepartmentChecklistBoard({ canEdit, department }: { canEdit: boolean; department: Department }) {
  const { data: session } = useSession();
  const myName = session?.user?.name ?? "You";

  const today = toDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);
  const [fetching, setFetching] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

  const stripStart = useMemo(() => addDays(selectedDate, -parseDate(selectedDate).getDay()), [selectedDate]);
  const stripEnd = addDays(stripStart, 6);
  const stripDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(stripStart, i)), [stripStart]);
  const checklistDate = selectedDate;
  const loaded = loadedDate === checklistDate;

  const loadItems = useCallback(async (date: string) => {
    const id = ++requestId.current;
    setFetching(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/maintenance/checklists?date=${date}&department=${department}`);
      if (!res.ok) throw new Error("Unable to load checklists");
      const data = await res.json();
      if (id !== requestId.current) return;
      setItems(data.items);
      setLoadedDate(date);
    } catch {
      if (id === requestId.current) { setLoadError(true); setLoadedDate(null); }
    } finally {
      if (id === requestId.current) setFetching(false);
    }
  }, [department]);

  useEffect(() => {
    loadItems(checklistDate);
  }, [checklistDate, loadItems]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/maintenance/checklists/summary?start=${stripStart}&end=${stripEnd}&department=${department}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !cancelled) setSummary(data);
      });
    return () => {
      cancelled = true;
    };
  }, [stripStart, stripEnd, department]);

  function bumpSummary(period: Period, delta: number) {
    setSummary((prev) => {
      if (!prev || period === "WEEKLY") return prev;
      const day = prev.days[selectedDate] ?? { dailyDone: 0 };
      const next = { ...day };
      if (period === "DAILY") next.dailyDone = Math.max(0, next.dailyDone + delta);
      return { ...prev, days: { ...prev.days, [selectedDate]: next } };
    });
  }

  async function toggleItem(item: ChecklistItem, slot: "SINGLE" | "AM" | "PM" = "SINGLE") {
    const field = slot === "AM" ? "amCompletion" : slot === "PM" ? "pmCompletion" : "completion";
    const previous = item[field];
    if (previous && !previous.canUncheck) return;
    const completed = !previous;
    const optimistic: Completion | null = completed
      ? { completedAt: new Date().toISOString(), completedByName: myName, canUncheck: true }
      : null;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, [field]: optimistic } : i))
    );
    bumpSummary(item.period, completed ? 1 : -1);

    const res = await fetch("/api/maintenance/checklists/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, itemId: item.id, date: item.completionDate ?? (item.period === "WEEKLY" ? stripStart : selectedDate), completed }),
    });
    if (!res.ok) {
      // Revert by refetching the authoritative state.
      loadItems(checklistDate);
      bumpSummary(item.period, completed ? -1 : 1);
      return;
    }
    const data = await res.json();
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, [field]: data.completion } : i))
    );
    if (item.period === "WEEKLY" && item.completionDate && item.completionDate < stripStart) await loadItems(checklistDate);
  }

  async function addItem(period: Period, title: string) {
    const res = await fetch("/api/maintenance/checklists/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department, period, title }),
    });
    if (!res.ok) return;
    const item = await res.json();
    setItems((prev) => [...prev, { ...item, completion: null }]);
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            dailyTotal: prev.dailyTotal + (period === "DAILY" ? 1 : 0),
          }
        : prev
    );
  }

  async function renameItem(itemId: string, title: string, dueWeekday?: number | null, dualCheck?: boolean) {
    const res = await fetch(`/api/maintenance/checklists/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, ...(dualCheck !== undefined ? { dualCheck } : {}), ...(dueWeekday !== undefined ? { dueWeekday } : {}) }),
    });
    if (res.ok) {
      await loadItems(checklistDate);
      const summaryRes = await fetch(`/api/maintenance/checklists/summary?start=${stripStart}&end=${stripEnd}&department=${department}`);
      if (summaryRes.ok) setSummary(await summaryRes.json());
    }
  }

  async function deleteItem(item: ChecklistItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            dailyTotal: Math.max(0, prev.dailyTotal - (item.period === "DAILY" ? (item.dualCheck ? 2 : 1) : 0)),
          }
        : prev
    );
    await fetch(`/api/maintenance/checklists/items/${item.id}`, { method: "DELETE" });
  }

  async function reorderPeriod(period: Period, reordered: ChecklistItem[]) {
    setItems((prev) => {
      const others = prev.filter((i) => i.period !== period);
      return [...others, ...reordered.map((item, index) => ({ ...item, order: index }))];
    });
    await fetch("/api/maintenance/checklists/items/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department, period, orderedIds: reordered.map((i) => i.id) }),
    });
  }

  return (
    <div className="max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Pet Resort daily and weekly sign-off</p>
        </div>
        {canEdit && (
          <Button
            variant={editMode ? "primary" : "secondary"}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "Done editing" : "Edit checklists"}
          </Button>
        )}
      </div>

      <DateStrip
        dates={stripDates}
        selected={selectedDate}
        today={today}
        summary={summary}
        weekly={false}
        onSelect={setSelectedDate}
      />

      {loadError && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          Unable to load checklists. <button className="underline" onClick={() => loadItems(checklistDate)}>Try again</button>
        </p>
      )}
      <div
        className={cn(
          "mt-5 grid grid-cols-1 gap-4 md:gap-6 transition-opacity",
          "lg:grid-cols-2",
          fetching && loaded && "opacity-60"
        )}
      >
        {PERIODS.map((cfg) => (
          <PeriodCard
            weekStart={stripStart}
            key={cfg.period}
            cfg={cfg.period === "WEEKLY" ? {
              ...cfg,
              sublabel: `${parseDate(stripStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${parseDate(stripEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · Sunday–Saturday`,
            } : cfg}
            items={(loaded ? items : [])
              .filter((i) => i.period === cfg.period)
              .sort((a, b) => a.order - b.order)}
            loaded={loaded}
            editMode={editMode && loaded}
            canEdit={canEdit}
            onToggle={toggleItem}
            disabled={!loaded || fetching || (cfg.period === "WEEKLY" ? stripStart : selectedDate) > today}
            onAdd={(title) => addItem(cfg.period, title)}
            onRename={renameItem}
            onDelete={setPendingDelete}
            onReorder={(reordered) => reorderPeriod(cfg.period, reordered)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove checklist item"
        message={`Remove "${pendingDelete?.title}" from the ${
          pendingDelete?.period === "WEEKLY" ? "weekly" : "daily"
        } checklist? Days it was already signed off keep their records.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingDelete) deleteItem(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// ── Date strip ──────────────────────────────────────────────────────────────

function DateStrip({
  dates,
  selected,
  today,
  summary,
  weekly,
  onSelect,
}: {
  dates: string[];
  selected: string;
  today: string;
  summary: SummaryData | null;
  weekly: boolean;
  onSelect: (date: string) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);

  function dayStatus(date: string): "complete" | "partial" | "none" {
    if (!summary) return "none";
    const day = summary.days[date];
    const total = summary.dailyTotal;
    if (!day || total === 0) return "none";
    const done = day.dailyDone;
    if (done >= total) return "complete";
    return done > 0 ? "partial" : "none";
  }

  const formatDay = (date: string) => parseDate(date).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const weekLabel = `${formatDay(dates[0])} – ${formatDay(dates[6])}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-2">
        <div className="grid w-full grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-1 sm:flex sm:w-auto sm:gap-2">
          <button type="button" aria-label="Previous week" onClick={() => onSelect(addDays(selected, -7))}
            className="min-h-11 min-w-11 rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100">{"<"}</button>
          <p className="text-center text-xs sm:text-sm font-medium text-gray-700">{weekLabel}</p>
          <button type="button" aria-label="Next week" onClick={() => onSelect(addDays(selected, 7))}
            className="min-h-11 min-w-11 rounded-md px-2 py-1.5 text-gray-600 hover:bg-gray-100">{">"}</button>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {selected !== today && (
            <button
              onClick={() => onSelect(today)}
              className="min-h-11 px-2 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Back to today
            </button>
          )}
          <button
            onClick={() => {
              const el = pickerRef.current;
              if (!el) return;
              if ("showPicker" in el) el.showPicker();
              else (el as HTMLInputElement).click();
            }}
            title="Jump to a date"
            aria-label="Jump to a date"
            className="grid min-h-11 min-w-11 place-items-center rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
          <input
            ref={pickerRef}
            type="date"
            value={selected}
            onChange={(e) => {
              if (e.target.value) onSelect(e.target.value);
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {dates.map((date) => {
          const d = parseDate(date);
          const isSelected = date === selected;
          const isToday = date === today;
          const status = dayStatus(date);
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              aria-label={d.toLocaleDateString("en-US", { dateStyle: "full" })}
              aria-pressed={weekly || isSelected}
              className={cn(
                "flex min-w-0 flex-col items-center rounded-lg border py-2 transition-colors",
                weekly ? "border-blue-100 bg-blue-50 text-blue-700" : isSelected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-transparent text-gray-600 hover:bg-gray-100"
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  isSelected && !weekly ? "text-blue-100" : "text-gray-400"
                )}
              >
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold leading-6",
                  isToday && !isSelected && "text-blue-600"
                )}
              >
                {d.getDate()}
              </span>
              <span
                className={cn(
                  "mt-0.5 h-1.5 w-1.5 rounded-full",
                  status === "complete" && (isSelected ? "bg-white" : "bg-green-500"),
                  status === "partial" && (isSelected ? "bg-blue-200" : "bg-amber-400"),
                  status === "none" && "bg-transparent"
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily / Weekly card ────────────────────────────────────────────────────────────

function PeriodCard({
  cfg,
  weekStart,
  items,
  loaded,
  editMode,
  canEdit,
  onToggle,
  disabled,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: {
  cfg: (typeof PERIODS)[number];
  weekStart: string;
  items: ChecklistItem[];
  loaded: boolean;
  editMode: boolean;
  canEdit: boolean;
  onToggle: (item: ChecklistItem, slot?: "SINGLE" | "AM" | "PM") => void;
  disabled: boolean;
  onAdd: (title: string) => void;
  onRename: (itemId: string, title: string, dueWeekday?: number | null, dualCheck?: boolean) => void;
  onDelete: (item: ChecklistItem) => void;
  onReorder: (items: ChecklistItem[]) => void;
}) {
  const done = items.reduce((sum, item) => sum + (item.dualCheck ? Number(!!item.amCompletion) + Number(!!item.pmCompletion) : Number(!!item.completion)), 0);
  const total = items.reduce((sum, item) => sum + (item.dualCheck ? 2 : 1), 0);
  const allDone = total > 0 && done === total;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div
          className={cn(
            "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-lg",
            cfg.iconClass
          )}
        >
          {cfg.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">{cfg.label}</h2>
          <p className="text-xs text-gray-400">{cfg.sublabel}</p>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                allDone ? "text-green-600" : "text-gray-500"
              )}
            >
              {done}/{total}
            </span>
            <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32" aria-hidden>
              <circle cx="16" cy="16" r="13" fill="none" strokeWidth="3.5" className="stroke-gray-100" />
              <circle
                cx="16"
                cy="16"
                r="13"
                fill="none"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(done / total) * 81.7} 81.7`}
                className={cn(
                  "transition-all duration-300",
                  allDone ? "stroke-green-500" : "stroke-blue-500"
                )}
              />
            </svg>
          </div>
        )}
      </div>

      <div className="flex-1 p-2.5">
        {!loaded ? (
          <div className="space-y-2 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : editMode ? (
          <EditableList items={items} onRename={onRename} onDelete={onDelete} onReorder={onReorder} onAdd={onAdd} />
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-400">
            No items yet.{" "}
            {canEdit ? "Use “Edit checklists” to add some." : "Corporate can add them."}
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                {item.dualCheck ? <div className="rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="flex shrink-0 items-center gap-2">
                      {(["AM", "PM"] as const).map((slot) => {
                        const completion = slot === "AM" ? item.amCompletion : item.pmCompletion;
                        return <button key={slot} type="button" aria-label={`${slot}: ${item.title}`} aria-pressed={!!completion}
                          title={completion ? `${slot}: ${completion.completedByName ?? "Unknown"} · ${formatTime(completion.completedAt)}` : `Complete ${slot}`}
                          disabled={disabled || (!!completion && !completion.canUncheck)}
                          onClick={() => onToggle(item, slot)}
                          className="group flex min-h-11 shrink-0 items-center gap-1.5 rounded-md py-1 text-xs text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
                          <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors", completion ? "border-green-500 bg-green-500" : "border-gray-300 bg-white group-hover:border-blue-400")}>
                            {completion && <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l4 4 8-9" /></svg>}
                          </span>
                          <span>{slot}</span>
                        </button>;
                      })}
                    </div>
                    <span className={cn("min-w-0 flex-1 break-words text-sm", item.amCompletion && item.pmCompletion ? "text-gray-400 line-through decoration-gray-300" : "text-gray-800")}>{item.title}</span>
                  </div>
                  {(item.amCompletion || item.pmCompletion) && <p className="mt-1 text-xs text-gray-400">
                    {(["AM", "PM"] as const).map((slot) => {
                      const completion = slot === "AM" ? item.amCompletion : item.pmCompletion;
                      return completion ? `${slot}: ${completion.completedByName ?? "Unknown"} · ${formatTime(completion.completedAt)}` : null;
                    }).filter(Boolean).join(" · ")}
                  </p>}
                  {item.completion && <p className="mt-1 text-xs text-gray-400">Earlier single sign-off: {item.completion.completedByName ?? "Unknown"} · {formatTime(item.completion.completedAt)}</p>}
                </div> : <button
                  onClick={() => onToggle(item)}
                  disabled={disabled || (!!item.completion && !item.completion.canUncheck)}
                  title={item.completion && !item.completion.canUncheck ? "Only the employee who completed this task can uncheck it" : undefined}
                  aria-pressed={!!item.completion}
                  className="group flex min-h-11 w-full flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border-2 transition-colors",
                      item.completion
                        ? "border-green-500 bg-green-500"
                        : "border-gray-300 bg-white group-hover:border-blue-400"
                    )}
                  >
                    {item.completion && (
                      <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l4 4 8-9" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block break-words text-sm",
                        item.completion ? "text-gray-400 line-through decoration-gray-300" : "text-gray-800"
                      )}
                    >
                      {item.title}
                      {item.period === "WEEKLY" && item.dueWeekday != null && (
                        <span className={cn("mt-1 block text-xs no-underline", !item.completion && addDays(item.completionDate ?? weekStart, item.dueWeekday) < toDateStr(new Date()) ? "font-semibold text-red-600" : "text-gray-500")}>
                          {!item.completion && addDays(item.completionDate ?? weekStart, item.dueWeekday) < toDateStr(new Date()) ? "Overdue · " : ""}Due {WEEKDAYS[item.dueWeekday]}
                        </span>
                      )}
                      {!item.isActive && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 no-underline">
                          removed
                        </span>
                      )}
                    </span>
                  </span>
                  {item.completion && (
                    <span className="w-full pl-9 text-xs text-gray-400 sm:w-auto sm:pl-0">
                      {item.completion.completedByName ?? "Unknown"} · {formatTime(item.completion.completedAt)}
                    </span>
                  )}
                </button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {loaded && !editMode && allDone && (
        <div className="border-t border-green-100 bg-green-50 px-5 py-2.5 text-center text-xs font-medium text-green-700">
          ✓ All items signed off
        </div>
      )}
    </Card>
  );
}

// ── Manager edit mode ───────────────────────────────────────────────────────

function EditableList({
  items,
  onRename,
  onDelete,
  onReorder,
  onAdd,
}: {
  items: ChecklistItem[];
  onRename: (itemId: string, title: string, dueWeekday?: number | null, dualCheck?: boolean) => void;
  onDelete: (item: ChecklistItem) => void;
  onReorder: (items: ChecklistItem[]) => void;
  onAdd: (title: string) => void;
}) {
  // Archived items can't be reordered — only active ones show in edit mode.
  const active = items.filter((i) => i.isActive);
  const [newTitle, setNewTitle] = useState("");

  function submitNew() {
    const title = newTitle.trim();
    if (!title) return;
    onAdd(title);
    setNewTitle("");
  }

  return (
    <div className="p-1">
      <SortableList
        items={active}
        onReorder={onReorder}
        renderItem={(item, handle) => (
          <EditableRow key={item.id} item={item} handle={handle} onRename={onRename} onDelete={onDelete} />
        )}
      />
      <div className="mt-2 flex items-center gap-2 px-1">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
          }}
          placeholder="Add an item…"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-base sm:text-sm text-gray-900 placeholder-gray-400 focus:border-solid focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button size="sm" variant="secondary" onClick={submitNew} disabled={!newTitle.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function EditableRow({
  item,
  handle,
  onRename,
  onDelete,
}: {
  item: ChecklistItem;
  handle: SortableHandleProps;
  onRename: (itemId: string, title: string, dueWeekday?: number | null, dualCheck?: boolean) => void;
  onDelete: (item: ChecklistItem) => void;
}) {
  const [title, setTitle] = useState(item.title);

  return (
    <div className="mb-2 grid grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-1.5 sm:flex rounded-lg border border-gray-200 bg-white px-2 py-1.5">
      <DragHandle {...handle} />
      {item.period === "DAILY" && <label className="col-start-2 row-start-2 flex min-h-11 items-center gap-2 text-sm text-gray-600 sm:text-xs">
        <input type="checkbox" className="h-5 w-5" checked={!!item.dualCheck} aria-label={`AM + PM checks for ${item.title}`}
          onChange={(event) => onRename(item.id, title.trim() || item.title, undefined, event.target.checked)} />
        AM + PM
      </label>}
      {item.period === "WEEKLY" && <select aria-label={`Due day for ${item.title}`} value={item.dueWeekday ?? ""}
        onChange={(event) => onRename(item.id, title.trim() || item.title, event.target.value === "" ? null : Number(event.target.value))}
        className="col-start-2 row-start-2 min-h-11 max-w-full rounded border border-gray-200 px-2 py-1 text-base sm:max-w-32 sm:text-xs">
        <option value="">Any day</option>
        {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
      </select>}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const trimmed = title.trim();
          if (!trimmed) setTitle(item.title);
          else if (trimmed !== item.title) onRename(item.id, trimmed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="col-start-2 row-start-1 min-h-11 min-w-0 flex-1 rounded px-1.5 py-1 text-base sm:text-sm text-gray-800 focus:bg-blue-50/50 focus:outline-none"
      />
      <button
        onClick={() => onDelete(item)}
        title="Remove item"
        aria-label={`Remove ${item.title}`}
        className="col-start-3 row-start-1 grid min-h-11 min-w-11 place-items-center rounded-md p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
