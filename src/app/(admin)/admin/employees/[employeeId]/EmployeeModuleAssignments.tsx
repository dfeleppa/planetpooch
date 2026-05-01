"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";

interface ModuleSummary {
  id: string;
  title: string;
  icon: string | null;
}

interface AssignmentRow {
  moduleId: string;
  module: ModuleSummary;
  assignedAt: string;
}

export function EmployeeModuleAssignments({
  employeeId,
}: {
  employeeId: string;
}) {
  const [assignments, setAssignments] = useState<AssignmentRow[] | null>(null);
  const [allModules, setAllModules] = useState<ModuleSummary[] | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function loadAssignments() {
    const res = await fetch(`/api/employees/${employeeId}/module-assignments`);
    if (res.ok) {
      const data: AssignmentRow[] = await res.json();
      setAssignments(data);
    }
  }

  async function loadModules() {
    const res = await fetch(`/api/modules`);
    if (res.ok) {
      const data: ModuleSummary[] = await res.json();
      setAllModules(data);
    }
  }

  useEffect(() => {
    loadAssignments();
    loadModules();
  }, [employeeId]);

  const assignedIds = useMemo(
    () => new Set((assignments ?? []).map((a) => a.moduleId)),
    [assignments],
  );

  const available = useMemo(
    () => (allModules ?? []).filter((m) => !assignedIds.has(m.id)),
    [allModules, assignedIds],
  );

  async function handleAdd() {
    if (!picked) return;
    setBusy(true);
    const res = await fetch(`/api/employees/${employeeId}/module-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId: picked }),
    });
    setBusy(false);
    if (res.ok) {
      setPicked("");
      loadAssignments();
    }
  }

  async function handleRemove(moduleId: string) {
    setBusy(true);
    const res = await fetch(
      `/api/employees/${employeeId}/module-assignments?moduleId=${encodeURIComponent(moduleId)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (res.ok) loadAssignments();
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900">Module assignments</h2>
        <p className="text-sm text-gray-500">
          Modules individually granted to this employee — these stack on top of
          any modules they already have access to via their job title.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              id="assign-module"
              label="Add a module"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              disabled={!allModules || available.length === 0}
            >
              <option value="">
                {available.length === 0
                  ? "No more modules to assign"
                  : "Pick a module..."}
              </option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.icon ? `${m.icon} ` : ""}
                  {m.title}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!picked || busy}>
            Assign
          </Button>
        </div>

        <div className="mt-4">
          {assignments === null ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-gray-500">
              No individual assignments. This employee only sees modules
              assigned to their job title.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-100">
              {assignments.map((a) => (
                <li
                  key={a.moduleId}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-sm text-gray-900">
                    {a.module.icon && (
                      <span className="mr-1">{a.module.icon}</span>
                    )}
                    {a.module.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(a.moduleId)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
