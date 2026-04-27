"use client";

import { DAYS_OF_WEEK, timeSlots } from "@/lib/availability";
import type { DayOfWeek } from "@prisma/client";

export interface AvailabilityEntry {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

interface Props {
  value: AvailabilityEntry[];
  onChange: (next: AvailabilityEntry[]) => void;
  disabled?: boolean;
}

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";

export function AvailabilityEditor({ value, onChange, disabled }: Props) {
  const slots = timeSlots();
  const byDay = new Map(value.map((v) => [v.dayOfWeek, v]));

  function toggleDay(day: DayOfWeek, checked: boolean) {
    if (checked) {
      const next = [
        ...value,
        { dayOfWeek: day, startTime: DEFAULT_START, endTime: DEFAULT_END },
      ];
      onChange(sortByDay(next));
    } else {
      onChange(value.filter((v) => v.dayOfWeek !== day));
    }
  }

  function updateTime(day: DayOfWeek, field: "startTime" | "endTime", time: string) {
    onChange(
      value.map((v) => (v.dayOfWeek === day ? { ...v, [field]: time } : v))
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">Availability</label>
      <p className="text-xs text-gray-500 mb-1">
        Check the days the employee is available and pick a start and end time.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {DAYS_OF_WEEK.map((day) => {
          const entry = byDay.get(day.value);
          const checked = !!entry;
          const invalid =
            !!entry && entry.endTime <= entry.startTime;
          return (
            <div
              key={day.value}
              className="grid grid-cols-[auto_7rem_1fr_auto_1fr] items-center gap-3 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggleDay(day.value, e.target.checked)}
                disabled={disabled}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label={`Available on ${day.label}`}
              />
              <span className="text-sm text-gray-900">{day.label}</span>
              <select
                value={entry?.startTime ?? DEFAULT_START}
                onChange={(e) => updateTime(day.value, "startTime", e.target.value)}
                disabled={disabled || !checked}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                aria-label={`${day.label} start time`}
              >
                {slots.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">to</span>
              <select
                value={entry?.endTime ?? DEFAULT_END}
                onChange={(e) => updateTime(day.value, "endTime", e.target.value)}
                disabled={disabled || !checked}
                className={`rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 ${
                  invalid ? "border-red-400" : "border-gray-300"
                }`}
                aria-label={`${day.label} end time`}
              >
                {slots.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {value.some((v) => v.endTime <= v.startTime) && (
        <p className="text-xs text-red-600 mt-1">
          End time must be after start time.
        </p>
      )}
    </div>
  );
}

function sortByDay(entries: AvailabilityEntry[]): AvailabilityEntry[] {
  const order = new Map(DAYS_OF_WEEK.map((d, i) => [d.value, i]));
  return [...entries].sort(
    (a, b) => (order.get(a.dayOfWeek) ?? 0) - (order.get(b.dayOfWeek) ?? 0)
  );
}
