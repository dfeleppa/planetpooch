"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  icon: string | null;
  totalLessons: number;
  completedLessons: number;
}

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadModules() {
    const res = await fetch("/api/modules");
    const data = await res.json();
    setModules(data);
    setLoading(false);
  }

  useEffect(() => { loadModules(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, icon: icon || null }),
    });
    if (res.ok) {
      setTitle("");
      setDescription("");
      setIcon("");
      setShowCreate(false);
      loadModules();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this module and all its content?")) return;
    await fetch(`/api/modules/${id}`, { method: "DELETE" });
    loadModules();
  }

  if (loading) {
    return <div className="text-gray-500">Loading modules...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Modules</h1>
          <p className="text-gray-500 mt-1">Create, edit, and organize training modules</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "New Module"}
        </Button>
      </div>

      {showCreate && (
        <Card className="mt-4">
          <CardContent className="py-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <Input id="description" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input id="icon" label="Icon (emoji)" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. 📚" />
              <Button type="submit">Create Module</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 mt-6">
        {modules.map((mod) => (
          <Card key={mod.id} className="hover:shadow-md transition-shadow">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {mod.icon && <span className="text-2xl">{mod.icon}</span>}
                  <div>
                    <Link href={`/admin/modules/${mod.id}`} className="text-lg font-medium text-gray-900 hover:text-blue-600">
                      {mod.title}
                    </Link>
                    {mod.description && <p className="text-sm text-gray-500">{mod.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{mod.totalLessons} lessons</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/modules/${mod.id}`}>
                    <Button variant="secondary" size="sm">Edit</Button>
                  </Link>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(mod.id)}>Delete</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {modules.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No modules yet. Create your first module above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
