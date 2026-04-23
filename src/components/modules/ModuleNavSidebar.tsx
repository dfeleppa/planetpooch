"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Lesson {
  id: string;
  title: string;
  order: number;
}

interface Subsection {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface ModuleNavSidebarProps {
  moduleId: string;
  moduleTitle: string;
  subsections: Subsection[];
  completedLessonIds: string[];
}

export function ModuleNavSidebar({
  moduleId,
  moduleTitle,
  subsections,
  completedLessonIds,
}: ModuleNavSidebarProps) {
  const pathname = usePathname();
  const completedSet = new Set(completedLessonIds);

  // All subsections expanded by default
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});
  const [sidebarHidden, setSidebarHidden] = useState(false);

  function toggleSub(subId: string) {
    setCollapsedSubs((prev) => ({ ...prev, [subId]: !prev[subId] }));
  }

  const totalLessons = subsections.reduce((acc, s) => acc + s.lessons.length, 0);
  const completedCount = subsections
    .flatMap((s) => s.lessons)
    .filter((l) => completedSet.has(l.id)).length;

  if (sidebarHidden) {
    return (
      <div className="flex flex-col items-center pt-4 w-10 border-r border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => setSidebarHidden(false)}
          title="Show module navigation"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <aside className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/modules"
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Modules
          </Link>
          <h2 className="text-sm font-semibold text-gray-900 mt-1 leading-tight">{moduleTitle}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {completedCount} / {totalLessons} lessons
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: totalLessons > 0 ? `${(completedCount / totalLessons) * 100}%` : "0%" }}
            />
          </div>
        </div>
        <button
          onClick={() => setSidebarHidden(true)}
          title="Hide module navigation"
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0 mt-0.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Lesson list */}
      <nav className="flex-1 overflow-y-auto py-2">
        {subsections.map((sub) => {
          const isSubCollapsed = collapsedSubs[sub.id] ?? false;
          const subCompletedCount = sub.lessons.filter((l) => completedSet.has(l.id)).length;

          return (
            <div key={sub.id} className="mb-1">
              <button
                onClick={() => toggleSub(sub.id)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg
                  className={cn(
                    "w-3 h-3 flex-shrink-0 transition-transform duration-200",
                    isSubCollapsed ? "-rotate-90" : ""
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <span className="flex-1 text-left truncate">{sub.title}</span>
                <span className="text-gray-400 font-normal normal-case tracking-normal">
                  {subCompletedCount}/{sub.lessons.length}
                </span>
              </button>

              {!isSubCollapsed && (
                <ul className="pb-1">
                  {sub.lessons.map((lesson) => {
                    const isActive =
                      pathname === `/modules/${moduleId}/lessons/${lesson.id}`;
                    const isCompleted = completedSet.has(lesson.id);

                    return (
                      <li key={lesson.id}>
                        <Link
                          href={`/modules/${moduleId}/lessons/${lesson.id}`}
                          className={cn(
                            "flex items-center gap-3 pl-8 pr-4 py-2 text-sm transition-colors",
                            isActive
                              ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          )}
                        >
                          {/* Completion circle */}
                          <span
                            className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                              isCompleted
                                ? "bg-green-500 border-green-500 text-white"
                                : isActive
                                ? "border-blue-400"
                                : "border-gray-300"
                            )}
                          >
                            {isCompleted && (
                              <svg
                                className="w-2.5 h-2.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </span>
                          <span className="leading-snug">{lesson.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
