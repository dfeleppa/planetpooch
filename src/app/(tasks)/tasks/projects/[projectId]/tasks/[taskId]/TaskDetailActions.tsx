"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { DateInput } from "@/components/ui/DateInput";

interface User { id: string; name: string }
interface SubProject { id: string; name: string }

interface Props {
  taskId: string;
  projectId: string;
  currentStatus: string;
  currentPriority: string;
  currentDueDate: string;
  currentSubProjectId: string;
  currentAssigneeIds: string[];
  members: User[];
  subProjects: SubProject[];
  currentUserId: string;
}

export function TaskDetailActions({
  taskId,
  projectId,
  currentStatus,
  currentPriority,
  currentDueDate,
  currentSubProjectId,
  currentAssigneeIds,
  members,
  subProjects,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [priority, setPriority] = useState(currentPriority);
  const [dueDate, setDueDate] = useState(currentDueDate);
  const [subProjectId, setSubProjectId] = useState(currentSubProjectId);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(currentAssigneeIds);
  const [saving, setSaving] = useState(false);

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/tasks/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority, dueDate: dueDate || null, subProjectId: subProjectId || null }),
      });

      // Sync assignees: add/remove as needed
      const toAdd = assigneeIds.filter((id) => !currentAssigneeIds.includes(id));
      const toRemove = currentAssigneeIds.filter((id) => !assigneeIds.includes(id));

      await Promise.all([
        ...toAdd.map((userId) =>
          fetch(`/api/tasks/tasks/${taskId}/assignees`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          })
        ),
        ...toRemove.map((userId) =>
          fetch(`/api/tasks/tasks/${taskId}/assignees?userId=${userId}`, { method: "DELETE" })
        ),
      ]);

      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await fetch(`/api/tasks/tasks/${taskId}`, { method: "DELETE" });
    router.push(`/tasks/projects/${projectId}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
      <Button variant="danger" size="sm" onClick={deleteTask}>Delete</Button>

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h3 className="text-base font-semibold">Edit Task</h3>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="DONE">Done</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
            <DateInput label="Due Date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            {subProjects.length > 0 && (
              <Select label="Sub-project" value={subProjectId} onChange={(e) => setSubProjectId(e.target.value)}>
                <option value="">None</option>
                {subProjects.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </Select>
            )}
            {members.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Assignees</p>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAssignee(m.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        assigneeIds.includes(m.id)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              <Button variant="secondary" onClick={() => { setEditing(false); setStatus(currentStatus); setPriority(currentPriority); }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
