"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AssignedUser {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
}

interface AssignmentsPayload {
  jobTitles: string[];
  users: AssignedUser[];
  allJobTitles: string[];
}

export function ModuleVisibilityCard({ moduleId }: { moduleId: string }) {
  const [data, setData] = useState<AssignmentsPayload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function load() {
    const res = await fetch(`/api/modules/${moduleId}/assignments`);
    if (!res.ok) return;
    const payload: AssignmentsPayload = await res.json();
    setData(payload);
    setSelected(new Set(payload.jobTitles));
  }

  useEffect(() => {
    load();
  }, [moduleId]);

  function toggle(title: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/modules/${moduleId}/assignments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitles: Array.from(selected) }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(new Date());
      load();
    }
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <CardContent className="py-4 text-sm text-gray-500">
          Loading visibility...
        </CardContent>
      </Card>
    );
  }

  const isOpen = selected.size === 0 && data.users.length === 0;
  const hasChanges =
    selected.size !== data.jobTitles.length ||
    data.jobTitles.some((t) => !selected.has(t));

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Visibility</h2>
            <p className="text-sm text-gray-500">
              Pick which job titles can see this module. Leave everything
              unchecked (with no individual assignments) to make it visible to
              all employees.
            </p>
          </div>
          {isOpen && (
            <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
              Visible to everyone
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data.allJobTitles.length === 0 ? (
          <p className="text-sm text-gray-500">
            No job titles in the system yet. Set a job title on at least one
            employee to enable role-based assignment.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {data.allJobTitles.map((title) => (
              <label
                key={title}
                className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(title)}
                  onChange={() => toggle(title)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {title}
              </label>
            ))}
          </div>
        )}

        {data.users.length > 0 && (
          <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Also individually assigned to{" "}
            <span className="font-medium text-gray-900">
              {data.users.length}
            </span>{" "}
            employee{data.users.length === 1 ? "" : "s"}.
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? "Saving..." : "Save visibility"}
          </Button>
          {savedAt && !hasChanges && (
            <span className="text-xs text-gray-500">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
