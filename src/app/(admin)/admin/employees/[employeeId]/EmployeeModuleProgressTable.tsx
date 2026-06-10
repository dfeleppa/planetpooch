"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

interface LessonProgressRow {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
}

interface SubsectionProgressRow {
  id: string;
  title: string;
  completed: number;
  total: number;
  lessons: LessonProgressRow[];
}

export interface ModuleProgressRow {
  id: string;
  title: string;
  completed: number;
  total: number;
  percent: number;
  completedAt: string | null;
  subsections: SubsectionProgressRow[];
}

function getBadgeVariant(module: ModuleProgressRow) {
  if (module.total > 0 && module.completed === module.total) return "success";
  if (module.completed > 0) return "warning";
  return "default";
}

export function EmployeeModuleProgressTable({
  modules,
}: {
  modules: ModuleProgressRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(moduleId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }

  if (modules.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
        No visible modules for this employee yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <TableHeader className="w-12">
            <span className="sr-only">Expand module</span>
          </TableHeader>
          <TableHeader>Module</TableHeader>
          <TableHeader className="w-40">Completion</TableHeader>
          <TableHeader className="w-28">Status</TableHeader>
          <TableHeader className="w-56">Completed</TableHeader>
        </tr>
      </TableHead>
      <TableBody>
        {modules.map((module) => {
          const isExpanded = expanded.has(module.id);

          return (
            <Fragment key={module.id}>
              <TableRow>
                <TableCell className="align-middle">
                  <button
                    type="button"
                    onClick={() => toggle(module.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${module.title}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
                  >
                    {isExpanded ? "-" : "+"}
                  </button>
                </TableCell>
                <TableCell className="font-medium text-gray-900">
                  {module.title}
                  <div className="mt-1 text-xs font-normal text-gray-500">
                    {module.completed} of {module.total} lessons complete
                  </div>
                </TableCell>
                <TableCell>
                  <ProgressBar
                    value={module.completed}
                    max={module.total}
                    size="sm"
                    showLabel={false}
                  />
                  <div className="mt-1 text-xs font-medium text-gray-600">
                    {module.percent}%
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getBadgeVariant(module)}>
                    {module.total > 0 && module.completed === module.total
                      ? "Complete"
                      : module.completed > 0
                        ? "In progress"
                        : "Not started"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {module.completedAt ?? "Not completed"}
                </TableCell>
              </TableRow>
              {isExpanded && (
                <TableRow className="hover:bg-white">
                  <TableCell className="bg-gray-50" />
                  <TableCell colSpan={4} className="bg-gray-50 p-0">
                    <div className="divide-y divide-gray-200">
                      {module.subsections.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-gray-500">
                          This module has no subsections or lessons yet.
                        </div>
                      ) : (
                        module.subsections.map((subsection) => (
                          <div key={subsection.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-sm font-semibold text-gray-800">
                                {subsection.title}
                              </h3>
                              <span className="text-xs text-gray-500">
                                {subsection.completed} of {subsection.total} complete
                              </span>
                            </div>
                            <div className="mt-2 overflow-hidden rounded-md border border-gray-200 bg-white">
                              {subsection.lessons.length === 0 ? (
                                <div className="px-3 py-3 text-sm text-gray-500">
                                  No lessons in this subsection.
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {subsection.lessons.map((lesson) => (
                                    <div
                                      key={lesson.id}
                                      className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_8rem_12rem]"
                                    >
                                      <div className="min-w-0 text-gray-800">
                                        {lesson.title}
                                      </div>
                                      <div
                                        className={cn(
                                          "font-medium",
                                          lesson.isCompleted
                                            ? "text-green-700"
                                            : "text-gray-500",
                                        )}
                                      >
                                        {lesson.isCompleted ? "Complete" : "Not started"}
                                      </div>
                                      <div className="text-gray-500">
                                        {lesson.completedAt ?? "-"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
