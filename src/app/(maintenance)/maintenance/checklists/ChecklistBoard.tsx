"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SortableList, DragHandle, SortableHandleProps } from "@/components/SortableList";

type Period = "AM" | "PM";

interface Completion {
  completedAt: string;
  completedByName: string | null;
}

interface ChecklistItem {
  id: string;
  period: Period;
  title: string;
  order: number;
  isActive: boolean;
  completion: Completion | null;
}

interface DaySummary {
  amDone: number;
  pmDone: number;
}

interface SummaryData {
  amTotal: number;
  pmTotal: number;
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
    period: "AM",
    label: "Morning",
    sublabel: "AM checklist",
    icon: "☀",
    iconClass: "bg-amber-50 text-amber-500",
  },
  {
    period: "PM",
    label: "Evening",
    sublabel: "PM checklist",
    icon: "☾",
    iconClass: "bg-indigo-50 text-indigo-500",
  },
];

const STRIP_DAYS = 21;

export function ChecklistBoard({ canEdit }: { canEdit: boolean }) {
  const { data: session } = useSession();
  const myName = session?.user?.name ?? "You";

  const today = toDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistItem | null>(null);

  // The strip always ends today; picking an older date via the calendar
  // extends it backwards so the selection is always visible in the strip.
  const stripStart = useMemo(() => {
    const defaultStart = addDays(today, -(STRIP_DAYS - 1));
    return selectedDate < defaultStart ? selectedDate : defaultStart;
  }, [selectedDate, today]);

  const stripDates = useMemo(() => {
    const dates: string[] = [];
    for (let d = stripStart; d <= today; d = addDays(d, 1)) dates.push(d);
    return dates;
  }, [stripStart, today]);

  const loadItems = useCallback(async (date: string) => {
    setFetching(true);
    try {
      const res = await fetch(`/api/maintenance/checklists?date=${date}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items);
      setLoaded(true);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    loadItems(selectedDate);
  }, [selectedDate, loadItems]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/maintenance/checklists/summary?start=${stripStart}&end=${today}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !cancelled) setSummary(data);
      });
    return () => {
      cancelled = true;
    };
  }, [stripStart, today]);

  function bumpSummary(period: Period, delta: number) {
    setSummary((prev) => {
      if (!prev) return prev;
      const day = prev.days[selectedDate] ?? { amDone: 0, pmDone: 0 };
      const next = { ...day };
      if (period === "AM") next.amDone = Math.max(0, next.amDone + delta);
      else next.pmDone = Math.max(0, next.pmDone + delta);
      return { ...prev, days: { ...prev.days, [selectedDate]: next } };
    });
  }

  async function toggleItem(item: ChecklistItem) {
    const completed = !item.completion;
    const optimistic: Completion | null = completed
      ? { completedAt: new Date().toISOString(), completedByName: myName }
      : null;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, completion: optimistic } : i))
    );
    bumpSummary(item.period, completed ? 1 : -1);

    const res = await fetch("/api/maintenance/checklists/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, date: selectedDate, completed }),
    });
    if (!res.ok) {
      // Revert by refetching the authoritative state.
      loadItems(selectedDate);
      bumpSummary(item.period, completed ? -1 : 1);
      return;
    }
    const data = await res.json();
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, completion: data.completion } : i))
    );
  }

  async function addItem(period: Period, title: string) {
    const res = await fetch("/api/maintenance/checklists/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, title }),
    });
    if (!res.ok) return;
    const item = await res.json();
    setItems((prev) => [...prev, { ...item, completion: null }]);
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            amTotal: prev.amTotal + (period === "AM" ? 1 : 0),
            pmTotal: prev.pmTotal + (period === "PM" ? 1 : 0),
          }
        : prev
    );
  }

  async function renameItem(itemId: string, title: string) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, title } : i)));
    await fetch(`/api/maintenance/checklists/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function deleteItem(item: ChecklistItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            amTotal: Math.max(0, prev.amTotal - (item.period === "AM" ? 1 : 0)),
            pmTotal: Math.max(0, prev.pmTotal - (item.period === "PM" ? 1 : 0)),
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
      body: JSON.stringify({ period, orderedIds: reordered.map((i) => i.id) }),
    });
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Checklists</h1>
          <p className="text-gray-500 mt-1">Pet Resort morning and evening sign-off</p>
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
        onSelect={setSelectedDate}
      />

      <div
        className={cn(
          "mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 transition-opacity",
          fetching && loaded && "opacity-60"
        )}
      >
        {PERIODS.map((cfg) => (
          <PeriodCard
            key={cfg.period}
            cfg={cfg}
            items={items
              .filter((i) => i.period === cfg.period)
              .sort((a, b) => a.order - b.order)}
            loaded={loaded}
            editMode={editMode}
            canEdit={canEdit}
            onToggle={toggleItem}
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
          pendingDelete?.period === "AM" ? "morning" : "evening"
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
  onSelect,
}: {
  dates: string[];
  selected: string;
  today: string;
  summary: SummaryData | null;
  onSelect: (date: string) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected]);

  function dayStatus(date: string): "complete" | "partial" | "none" {
    if (!summary) return "none";
    const day = summary.days[date];
    const total = summary.amTotal + summary.pmTotal;
    if (!day || total === 0) return "none";
    const done = day.amDone + day.pmDone;
    if (done >= total) return "complete";
    return done > 0 ? "partial" : "none";
  }

  const monthLabel = parseDate(selected).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-3 py-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-sm font-medium text-gray-700">{monthLabel}</p>
        <div className="flex items-center gap-2">
          {selected !== today && (
            <button
              onClick={() => onSelect(today)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
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
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
            max={today}
            value={selected}
            onChange={(e) => {
              if (e.target.value && e.target.value <= today) onSelect(e.target.value);
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {dates.map((date) => {
          const d = parseDate(date);
          const isSelected = date === selected;
          const isToday = date === today;
          const status = dayStatus(date);
          return (
            <button
              key={date}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelect(date)}
              className={cn(
                "flex w-12 flex-shrink-0 flex-col items-center rounded-lg border py-2 transition-colors",
                isSelected
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-transparent text-gray-600 hover:bg-gray-100"
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  isSelected ? "text-blue-100" : "text-gray-400"
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

// ── AM / PM card ────────────────────────────────────────────────────────────

function PeriodCard({
  cfg,
  items,
  loaded,
  editMode,
  canEdit,
  onToggle,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: {
  cfg: (typeof PERIODS)[number];
  items: ChecklistItem[];
  loaded: boolean;
  editMode: boolean;
  canEdit: boolean;
  onToggle: (item: ChecklistItem) => void;
  onAdd: (title: string) => void;
  onRename: (itemId: string, title: string) => void;
  onDelete: (item: ChecklistItem) => void;
  onReorder: (items: ChecklistItem[]) => void;
}) {
  const done = items.filter((i) => i.completion).length;
  const total = items.length;
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
            {canEdit ? "Use “Edit checklists” to add some." : "A manager can add them."}
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onToggle(item)}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
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
                        "block truncate text-sm",
                        item.completion ? "text-gray-400 line-through decoration-gray-300" : "text-gray-800"
                      )}
                    >
                      {item.title}
                      {!item.isActive && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 no-underline">
                          removed
                        </span>
                      )}
                    </span>
                  </span>
                  {item.completion && (
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {item.completion.completedByName ?? "Unknown"} · {formatTime(item.completion.completedAt)}
                    </span>
                  )}
                </button>
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
  onRename: (itemId: string, title: string) => void;
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
          className="flex-1 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-solid focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
  onRename: (itemId: string, title: string) => void;
  onDelete: (item: ChecklistItem) => void;
}) {
  const [title, setTitle] = useState(item.title);

  return (
    <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
      <DragHandle {...handle} />
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
        className="min-w-0 flex-1 rounded px-1.5 py-1 text-sm text-gray-800 focus:bg-blue-50/50 focus:outline-none"
      />
      <button
        onClick={() => onDelete(item)}
        title="Remove item"
        aria-label={`Remove ${item.title}`}
        className="rounded-md p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
