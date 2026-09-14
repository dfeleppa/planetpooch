"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
type Day = (typeof DAYS)[number];
type WeeklyTask = { id: string; title: string; day: Day };

const TASKS_KEY = "admin-dashboard-weekly-recurring-tasks";

function startOfWeek(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
}

function friendlyDate(dateKey: string, dayIndex: number) {
  const date = new Date(`${startOfWeek(dateKey)}T12:00:00`);
  date.setDate(date.getDate() + dayIndex);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WeeklyRecurringTasks({ dateKey }: { dateKey: string }) {
  const weekKey = startOfWeek(dateKey);
  const completionKey = `${TASKS_KEY}:completed:${weekKey}`;
  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState<Day>(DAYS[new Date(`${dateKey}T12:00:00`).getDay()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDay, setEditDay] = useState<Day>("Sunday");

  useEffect(() => {
    try {
      const savedTasks = window.localStorage.getItem(TASKS_KEY);
      const savedCompleted = window.localStorage.getItem(completionKey);
      setTasks(savedTasks ? JSON.parse(savedTasks) as WeeklyTask[] : []);
      setCompleted(savedCompleted ? JSON.parse(savedCompleted) as Record<string, boolean> : {});
    } catch {
      setTasks([]);
      setCompleted({});
    }
  }, [completionKey]);

  const completedCount = useMemo(() => tasks.filter((task) => completed[task.id]).length, [completed, tasks]);

  function saveTasks(next: WeeklyTask[]) {
    setTasks(next);
    try { window.localStorage.setItem(TASKS_KEY, JSON.stringify(next)); } catch { /* Keep the current page usable. */ }
  }

  function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    saveTasks([...tasks, { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`, title: cleanTitle, day }]);
    setTitle("");
    setShowForm(false);
  }

  function toggleTask(id: string) {
    setCompleted((current) => {
      const next = { ...current, [id]: !current[id] };
      try { window.localStorage.setItem(completionKey, JSON.stringify(next)); } catch { /* Keep the current page usable. */ }
      return next;
    });
  }

  function startEditing(task: WeeklyTask) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDay(task.day);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = editTitle.trim();
    if (!editingId || !cleanTitle) return;
    saveTasks(tasks.map((task) => task.id === editingId ? { ...task, title: cleanTitle, day: editDay } : task));
    setEditingId(null);
  }

  function removeTask(id: string) {
    saveTasks(tasks.filter((task) => task.id !== id));
  }

  return (
    <section aria-labelledby="weekly-tasks-heading" className="rounded-xl border border-pp-line bg-pp-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pp-line px-5 py-4">
        <div>
          <h2 id="weekly-tasks-heading" className="text-sm font-semibold text-pp-ink">Weekly recurring tasks</h2>
          <p className="mt-1 text-xs text-pp-ink-3">Repeats every week · {completedCount} of {tasks.length} complete</p>
        </div>
        <button type="button" onClick={() => setShowForm((current) => !current)} className="rounded-lg border border-pp-line bg-pp-surface px-3 py-2 text-xs font-medium text-pp-ink-2 hover:bg-pp-surface-2">
          {showForm ? "Cancel" : "+ Add task"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitTask} className="grid gap-3 border-b border-pp-line bg-pp-surface-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
          <label className="grid gap-1 text-xs font-medium text-pp-ink-2">
            Task
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to happen each week?" className="min-h-10 rounded-lg border border-pp-line bg-pp-surface px-3 text-sm text-pp-ink outline-none focus:border-pp-accent" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-pp-ink-2">
            Day
            <select value={day} onChange={(event) => setDay(event.target.value as Day)} className="min-h-10 rounded-lg border border-pp-line bg-pp-surface px-3 text-sm text-pp-ink outline-none focus:border-pp-accent">
              {DAYS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-10 self-end rounded-lg bg-pp-accent px-4 text-sm font-medium text-white hover:opacity-90">Save task</button>
        </form>
      )}

      <div className="overflow-x-auto">
        <div className="grid min-w-[70rem] grid-cols-7 gap-px bg-pp-line">
          {DAYS.map((dayName, dayIndex) => {
            const dayTasks = tasks.filter((task) => task.day === dayName);
            return (
              <div key={dayName} className="min-h-40 bg-pp-surface p-4">
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-pp-ink">{dayName}</h3>
                    <span className="text-xs text-pp-ink-4">{friendlyDate(dateKey, dayIndex)}</span>
                  </div>
                  {dayTasks.length === 0 ? <p className="text-xs text-pp-ink-4">Nothing scheduled</p> : (
                    <ul className="space-y-2">
                      {dayTasks.map((task) => (
                        <li key={task.id} className="rounded-lg border border-pp-line bg-pp-surface-2 p-3">
                          {editingId === task.id ? (
                            <form onSubmit={submitEdit} className="space-y-2">
                              <label className="sr-only" htmlFor={`edit-title-${task.id}`}>Task name</label>
                              <input id={`edit-title-${task.id}`} autoFocus value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="w-full rounded border border-pp-line bg-pp-surface px-2 py-1.5 text-sm text-pp-ink outline-none focus:border-pp-accent" />
                              <label className="sr-only" htmlFor={`edit-day-${task.id}`}>Day</label>
                              <select id={`edit-day-${task.id}`} value={editDay} onChange={(event) => setEditDay(event.target.value as Day)} className="w-full rounded border border-pp-line bg-pp-surface px-2 py-1.5 text-xs text-pp-ink-2">
                                {DAYS.map((item) => <option key={item}>{item}</option>)}
                              </select>
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-1 text-xs text-pp-ink-3 hover:bg-pp-bg-2">Cancel</button>
                                <button type="submit" className="rounded bg-pp-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90">Save</button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <label className="flex cursor-pointer items-start gap-2">
                                <input type="checkbox" checked={Boolean(completed[task.id])} onChange={() => toggleTask(task.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-pp-accent" />
                                <span className={`min-w-0 flex-1 break-words text-sm leading-5 ${completed[task.id] ? "text-pp-ink-4 line-through" : "text-pp-ink"}`}>{task.title}</span>
                              </label>
                              <div className="mt-2 flex items-center justify-end gap-1">
                                <button type="button" onClick={() => startEditing(task)} aria-label={`Edit ${task.title}`} title="Edit task" className="rounded p-1.5 text-pp-ink-4 hover:bg-pp-bg-2 hover:text-pp-ink">
                                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                                    <path d="M4 16h3l8.5-8.5a2.12 2.12 0 0 0-3-3L4 13v3Z" />
                                    <path d="m11.5 5.5 3 3" />
                                  </svg>
                                </button>
                                <button type="button" onClick={() => removeTask(task.id)} aria-label={`Remove ${task.title}`} title="Remove task" className="rounded p-1.5 text-pp-ink-4 hover:bg-pp-warn-bg hover:text-pp-warn">
                                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                                    <path d="m5 5 10 10M15 5 5 15" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
