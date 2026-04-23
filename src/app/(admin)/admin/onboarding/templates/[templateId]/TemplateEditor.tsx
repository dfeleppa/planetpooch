"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type TaskType =
  | "ESIGN_REQUEST"
  | "EMPLOYEE_CONFIRM"
  | "ADMIN_FILE_UPLOAD"
  | "ADMIN_TASK";

interface TemplateTask {
  id: string;
  type: TaskType;
  title: string;
  description: string;
  required: boolean;
  order: number;
  handbookFileName: string | null;
  externalUrl: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  tasks: TemplateTask[];
}

const TASK_TYPE_META: Record<
  TaskType,
  { label: string; icon: string; description: string; audience: "employee" | "admin" }
> = {
  ESIGN_REQUEST: {
    label: "E-Signature Request",
    icon: "✍️",
    description: "Employee signs a document via Google eSignature (admin sends the request).",
    audience: "employee",
  },
  EMPLOYEE_CONFIRM: {
    label: "Employee Confirmation",
    icon: "✅",
    description: "Employee self-reports a task is done (e.g., 'Bring ID to meeting').",
    audience: "employee",
  },
  ADMIN_FILE_UPLOAD: {
    label: "Admin File Upload",
    icon: "📤",
    description: "Admin uploads a file into the employee's Drive folder (e.g., signed I-9).",
    audience: "admin",
  },
  ADMIN_TASK: {
    label: "Admin Task",
    icon: "👔",
    description: "Admin-only checkbox for a task handled outside the portal (e.g., set up payroll).",
    audience: "admin",
  },
};

export function TemplateEditor({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Template-level editing
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // New-task form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newType, setNewType] = useState<TaskType>("ESIGN_REQUEST");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [newHandbookFileName, setNewHandbookFileName] = useState("");
  const [newExternalUrl, setNewExternalUrl] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = await res.json();
      setTemplate(data);
      setName(data.name);
      setDescription(data.description);
      setIsActive(data.isActive);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    setError("");
    try {
      const res = await fetch(`/api/onboarding/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate() {
    if (!confirm("Delete this template? Active onboardings will not be affected.")) {
      return;
    }
    try {
      const res = await fetch(`/api/onboarding/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      router.push("/admin/onboarding/templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function addTask() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch(
        `/api/onboarding/templates/${templateId}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: newType,
            title: newTitle,
            description: newDesc,
            required: newRequired,
            handbookFileName:
              newType === "ESIGN_REQUEST" ? newHandbookFileName : undefined,
            externalUrl: newType === "ADMIN_TASK" ? newExternalUrl : undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add task");
      }
      setShowNewTask(false);
      setNewType("ESIGN_REQUEST");
      setNewTitle("");
      setNewDesc("");
      setNewRequired(true);
      setNewHandbookFileName("");
      setNewExternalUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("Delete this task?")) return;
    try {
      const res = await fetch(
        `/api/onboarding/templates/${templateId}/tasks/${taskId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete task");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function toggleRequired(task: TemplateTask) {
    try {
      const res = await fetch(
        `/api/onboarding/templates/${templateId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ required: !task.required }),
        }
      );
      if (!res.ok) throw new Error("Failed to update task");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function move(taskId: string, direction: -1 | 1) {
    if (!template) return;
    const idx = template.tasks.findIndex((t) => t.id === taskId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= template.tasks.length) return;

    const reordered = [...template.tasks];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    // Optimistic UI
    setTemplate({ ...template, tasks: reordered });

    try {
      const res = await fetch(
        `/api/onboarding/templates/${templateId}/tasks`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskIds: reordered.map((t) => t.id) }),
        }
      );
      if (!res.ok) throw new Error("Failed to reorder");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      await load();
    }
  }

  if (loading) {
    return <div className="text-gray-500">Loading template...</div>;
  }
  if (!template) {
    return <div className="text-red-600">{error || "Template not found"}</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link href="/admin/onboarding" className="hover:text-blue-600">
            Onboarding
          </Link>
          <span>/</span>
          <Link
            href="/admin/onboarding/templates"
            className="hover:text-blue-600"
          >
            Templates
          </Link>
          <span>/</span>
          <span className="text-gray-900">{template.name}</span>
        </div>
      </div>

      {/* Template details */}
      <Card>
        <CardContent className="space-y-4">
          <Input
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              rows={2}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (can be assigned to new hires)
          </label>
          <div className="flex gap-3">
            <Button onClick={saveTemplate} disabled={savingTemplate}>
              {savingTemplate ? "Saving..." : "Save Template"}
            </Button>
            <Button variant="danger" onClick={deleteTemplate}>
              Delete
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Tasks ({template.tasks.length})
          </h2>
          {!showNewTask && (
            <Button onClick={() => setShowNewTask(true)}>+ Add Task</Button>
          )}
        </div>

        {showNewTask && (
          <Card className="mb-4 border-blue-200">
            <CardContent className="space-y-4">
              <h3 className="font-medium text-gray-900">New Task</h3>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as TaskType)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.keys(TASK_TYPE_META) as TaskType[]).map((t) => (
                    <option key={t} value={t}>
                      {TASK_TYPE_META[t].icon} {TASK_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {TASK_TYPE_META[newType].description}
                </p>
              </div>

              <Input
                label="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Read & sign Employee Handbook"
              />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Extra context or instructions shown to the user"
                />
              </div>

              {newType === "ESIGN_REQUEST" && (
                <Input
                  label="Document Label"
                  value={newHandbookFileName}
                  onChange={(e) => setNewHandbookFileName(e.target.value)}
                  placeholder="e.g., Employee Handbook 2026"
                />
              )}

              {newType === "ADMIN_TASK" && (
                <Input
                  label="External URL (optional)"
                  value={newExternalUrl}
                  onChange={(e) => setNewExternalUrl(e.target.value)}
                  placeholder="e.g., https://workforcenow.adp.com"
                />
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                />
                Required (blocks onboarding completion)
              </label>

              <div className="flex gap-3">
                <Button
                  onClick={addTask}
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? "Adding..." : "Add Task"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowNewTask(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {template.tasks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No tasks yet. Click &quot;+ Add Task&quot; to build the checklist.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {template.tasks.map((task, idx) => {
              const meta = TASK_TYPE_META[task.type];
              return (
                <Card key={task.id}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => move(task.id, -1)}
                          disabled={idx === 0}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => move(task.id, 1)}
                          disabled={idx === template.tasks.length - 1}
                          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base">{meta.icon}</span>
                          <span className="font-medium text-gray-900">
                            {task.title}
                          </span>
                          <Badge
                            variant={
                              meta.audience === "admin" ? "info" : "default"
                            }
                          >
                            {meta.label}
                          </Badge>
                          {task.required ? (
                            <Badge variant="warning">Required</Badge>
                          ) : (
                            <Badge variant="default">Optional</Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-500 mt-1">
                            {task.description}
                          </p>
                        )}
                        {task.handbookFileName && (
                          <p className="text-xs text-gray-400 mt-1">
                            Document: {task.handbookFileName}
                          </p>
                        )}
                        {task.externalUrl && (
                          <p className="text-xs text-gray-400 mt-1">
                            Link: {task.externalUrl}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRequired(task)}
                        >
                          {task.required ? "Make optional" : "Make required"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTask(task.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
