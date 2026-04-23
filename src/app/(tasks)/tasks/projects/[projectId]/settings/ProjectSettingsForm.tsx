"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface SubProject {
  id: string;
  name: string;
}

interface Props {
  project: {
    id: string;
    name: string;
    description: string;
    members: Member[];
    subProjects: SubProject[];
  };
  allUsers: { id: string; name: string; email: string }[];
}

export function ProjectSettingsForm({ project, allUsers }: Props) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [savingProject, setSavingProject] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberId, setNewMemberId] = useState(allUsers[0]?.id ?? "");
  const [newSubProjectName, setNewSubProjectName] = useState("");
  const [addingSubProject, setAddingSubProject] = useState(false);

  const nonMembers = allUsers.filter((u) => !project.members.find((m) => m.userId === u.id));

  const saveProject = async () => {
    setSavingProject(true);
    try {
      await fetch(`/api/tasks/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      router.refresh();
    } finally {
      setSavingProject(false);
    }
  };

  const addMember = async () => {
    if (!newMemberId) return;
    setAddingMember(true);
    try {
      await fetch(`/api/tasks/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newMemberId }),
      });
      router.refresh();
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/tasks/projects/${project.id}/members?userId=${userId}`, { method: "DELETE" });
    router.refresh();
  };

  const addSubProject = async () => {
    if (!newSubProjectName.trim()) return;
    setAddingSubProject(true);
    try {
      await fetch(`/api/tasks/projects/${project.id}/sub-projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSubProjectName }),
      });
      setNewSubProjectName("");
      router.refresh();
    } finally {
      setAddingSubProject(false);
    }
  };

  const deleteSubProject = async (subProjectId: string) => {
    await fetch(`/api/tasks/projects/${project.id}/sub-projects/${subProjectId}`, { method: "DELETE" });
    router.refresh();
  };

  const archiveProject = async () => {
    if (!confirm("Archive this project? It will be hidden from the dashboard.")) return;
    await fetch(`/api/tasks/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    });
    router.push("/tasks");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Project Details</h2></CardHeader>
        <CardContent className="pt-0 space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={3}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button onClick={saveProject} disabled={savingProject} size="sm">
            {savingProject ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Members</h2></CardHeader>
        <CardContent className="pt-0 space-y-3">
          {project.members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">{m.name}</p>
                <p className="text-xs text-gray-500">{m.email} · {m.role}</p>
              </div>
              {m.role !== "OWNER" && (
                <Button variant="ghost" size="sm" onClick={() => removeMember(m.userId)}>Remove</Button>
              )}
            </div>
          ))}
          {nonMembers.length > 0 && (
            <div className="flex gap-2 pt-2">
              <Select
                className="flex-1"
                value={newMemberId}
                onChange={(e) => setNewMemberId(e.target.value)}
              >
                {nonMembers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </Select>
              <Button size="sm" onClick={addMember} disabled={addingMember}>
                {addingMember ? "Adding..." : "Add"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Sub-Projects</h2></CardHeader>
        <CardContent className="pt-0 space-y-3">
          {project.subProjects.length === 0 && (
            <p className="text-sm text-gray-500">No sub-projects yet.</p>
          )}
          {project.subProjects.map((sp) => (
            <div key={sp.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
              <p className="text-sm font-medium text-gray-900">{sp.name}</p>
              <Button variant="ghost" size="sm" onClick={() => deleteSubProject(sp.id)}>Delete</Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Sub-project name..."
              value={newSubProjectName}
              onChange={(e) => setNewSubProjectName(e.target.value)}
              className="flex-1"
            />
            <Button size="sm" onClick={addSubProject} disabled={addingSubProject || !newSubProjectName.trim()}>
              {addingSubProject ? "Adding..." : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-900">Danger Zone</h2></CardHeader>
        <CardContent className="pt-0">
          <Button variant="danger" size="sm" onClick={archiveProject}>Archive Project</Button>
          <p className="text-xs text-gray-500 mt-1">Archived projects are hidden from the dashboard but data is preserved.</p>
        </CardContent>
      </Card>
    </div>
  );
}
