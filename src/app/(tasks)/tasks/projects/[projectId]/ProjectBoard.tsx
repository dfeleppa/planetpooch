"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AvatarGroup } from "@/components/ui/AvatarGroup";
import { Tabs } from "@/components/ui/Tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";

type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignees: { id: string; name: string }[];
  subtaskCount: number;
  commentCount: number;
}

interface Props {
  project: {
    id: string;
    tasks: Task[];
    subProjects: { id: string; name: string }[];
  };
}

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "TODO", label: "To Do", color: "bg-gray-100 text-gray-700" },
  { status: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { status: "IN_REVIEW", label: "In Review", color: "bg-yellow-100 text-yellow-700" },
  { status: "DONE", label: "Done", color: "bg-green-100 text-green-700" },
];

const PRIORITY_VARIANT: Record<TaskPriority, "default" | "info" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

function TaskCard({ task, projectId }: { task: Task; projectId: string }) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";

  return (
    <Link href={`/tasks/projects/${projectId}/tasks/${task.id}`}>
      <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow cursor-pointer space-y-2">
        <p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
              {isOverdue ? "⚠ " : ""}
              {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {task.subtaskCount > 0 && <span>↳ {task.subtaskCount}</span>}
            {task.commentCount > 0 && <span>💬 {task.commentCount}</span>}
          </div>
          {task.assignees.length > 0 && <AvatarGroup users={task.assignees} max={3} size="sm" />}
        </div>
      </div>
    </Link>
  );
}

export function ProjectBoard({ project }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");
  const [dragging, setDragging] = useState<string | null>(null);

  const handleDrop = async (taskId: string, newStatus: TaskStatus) => {
    setDragging(null);
    await fetch(`/api/tasks/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  };

  const tasksByStatus = (status: TaskStatus) =>
    project.tasks.filter((t) => t.status === status);

  return (
    <div>
      <Tabs
        tabs={[
          { id: "board", label: "Board" },
          { id: "list", label: "List" },
        ]}
        activeTab={view}
        onChange={(id) => setView(id as "board" | "list")}
        className="mb-6"
      />

      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => {
            const tasks = tasksByStatus(col.status);
            return (
              <div
                key={col.status}
                className="flex-shrink-0 w-72"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const taskId = e.dataTransfer.getData("taskId");
                  if (taskId) handleDrop(taskId, col.status);
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-gray-400">{tasks.length}</span>
                </div>
                <div className="space-y-2 min-h-16 rounded-lg p-1">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("taskId", task.id);
                        setDragging(task.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={`transition-opacity ${dragging === task.id ? "opacity-50" : ""}`}
                    >
                      <TaskCard task={task} projectId={project.id} />
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {project.tasks.length === 0 ? (
            <EmptyState icon="✅" title="No tasks yet" description="Add tasks to this project to get started." />
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeader>Title</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Priority</TableHeader>
                  <TableHeader>Due Date</TableHeader>
                  <TableHeader>Assignees</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {project.tasks.map((task) => {
                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";
                  return (
                    <TableRow key={task.id}>
                      <TableCell>
                        <Link href={`/tasks/projects/${project.id}/tasks/${task.id}`} className="font-medium text-blue-600 hover:underline">
                          {task.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            task.status === "DONE" ? "success" :
                            task.status === "IN_PROGRESS" ? "info" :
                            task.status === "IN_REVIEW" ? "warning" : "default"
                          }
                        >
                          {task.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
                      </TableCell>
                      <TableCell className={isOverdue ? "text-red-600 font-medium" : "text-gray-600"}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {task.assignees.length > 0 ? (
                          <AvatarGroup users={task.assignees} max={3} />
                        ) : (
                          <span className="text-gray-400 text-xs">Unassigned</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
