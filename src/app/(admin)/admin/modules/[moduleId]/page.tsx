"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { SortableList, DragHandle, SortableHandleProps } from "@/components/SortableList";

interface Lesson {
  id: string;
  title: string;
  order: number;
}

interface Subsection {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: Lesson[];
}

interface ModuleData {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  subsections: Subsection[];
}

export default function AdminModuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.moduleId as string;
  const [mod, setMod] = useState<ModuleData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit module form
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editing, setEditing] = useState(false);

  // New subsection form
  const [showNewSub, setShowNewSub] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubDesc, setNewSubDesc] = useState("");

  // New lesson form
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");

  // Inline subsection title rename
  const [renamingSubId, setRenamingSubId] = useState<string | null>(null);
  const [renameSubTitle, setRenameSubTitle] = useState("");

  async function loadModule() {
    const res = await fetch(`/api/modules/${moduleId}`);
    const data = await res.json();
    setMod(data);
    setEditTitle(data.title);
    setEditDesc(data.description);
    setEditIcon(data.icon || "");
    setLoading(false);
  }

  useEffect(() => { loadModule(); }, [moduleId]);

  async function handleUpdateModule(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/modules/${moduleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, description: editDesc, icon: editIcon || null }),
    });
    setEditing(false);
    loadModule();
  }

  async function handleCreateSubsection(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/modules/${moduleId}/subsections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubTitle, description: newSubDesc }),
    });
    setNewSubTitle("");
    setNewSubDesc("");
    setShowNewSub(false);
    loadModule();
  }

  async function handleDeleteSubsection(subsectionId: string) {
    if (!confirm("Delete this subsection and all its lessons?")) return;
    await fetch(`/api/modules/${moduleId}/subsections/${subsectionId}`, { method: "DELETE" });
    loadModule();
  }

  async function handleCreateLesson(subsectionId: string) {
    if (!newLessonTitle.trim()) return;
    await fetch(`/api/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newLessonTitle, subsectionId }),
    });
    setNewLessonTitle("");
    setAddingLessonTo(null);
    loadModule();
  }

  async function handleDeleteLesson(lessonId: string) {
    if (!confirm("Delete this lesson?")) return;
    await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
    loadModule();
  }

  function startRenameSubsection(sub: Subsection) {
    setRenamingSubId(sub.id);
    setRenameSubTitle(sub.title);
  }

  function cancelRenameSubsection() {
    setRenamingSubId(null);
    setRenameSubTitle("");
  }

  async function saveRenameSubsection(subsectionId: string) {
    if (!mod) return;
    const title = renameSubTitle.trim();
    if (!title) return;
    const original = mod.subsections.find((s) => s.id === subsectionId);
    if (!original || original.title === title) {
      cancelRenameSubsection();
      return;
    }
    setMod({
      ...mod,
      subsections: mod.subsections.map((s) =>
        s.id === subsectionId ? { ...s, title } : s,
      ),
    });
    setRenamingSubId(null);
    setRenameSubTitle("");
    const res = await fetch(`/api/modules/${moduleId}/subsections/${subsectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) loadModule();
  }

  async function handleReorderSubsections(next: Subsection[]) {
    if (!mod) return;
    setMod({ ...mod, subsections: next });
    const res = await fetch(`/api/modules/${moduleId}/subsections/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((s) => s.id) }),
    });
    if (!res.ok) loadModule();
  }

  async function handleReorderLessons(subsectionId: string, next: Lesson[]) {
    if (!mod) return;
    setMod({
      ...mod,
      subsections: mod.subsections.map((s) =>
        s.id === subsectionId ? { ...s, lessons: next } : s,
      ),
    });
    const res = await fetch(`/api/modules/${moduleId}/lessons/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((l) => l.id) }),
    });
    if (!res.ok) loadModule();
  }

  if (loading || !mod) {
    return <div className="text-gray-500">Loading module...</div>;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/admin/modules" className="hover:text-blue-600">Modules</Link>
        <span>/</span>
        <span className="text-gray-900">{mod.title}</span>
      </div>

      {/* Module header */}
      {editing ? (
        <Card className="mb-6">
          <CardContent className="py-4">
            <form onSubmit={handleUpdateModule} className="space-y-3">
              <Input id="edit-title" label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
              <Input id="edit-desc" label="Description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              <Input id="edit-icon" label="Icon (emoji)" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit">Save</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {mod.icon && <span className="text-3xl">{mod.icon}</span>}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{mod.title}</h1>
              {mod.description && <p className="text-gray-500">{mod.description}</p>}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit Module</Button>
        </div>
      )}

      {/* Subsections */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Subsections</h2>
        <Button size="sm" onClick={() => setShowNewSub(!showNewSub)}>
          {showNewSub ? "Cancel" : "Add Subsection"}
        </Button>
      </div>

      {showNewSub && (
        <Card className="mb-4">
          <CardContent className="py-4">
            <form onSubmit={handleCreateSubsection} className="space-y-3">
              <Input id="sub-title" label="Subsection Title" value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} required />
              <Input id="sub-desc" label="Description (optional)" value={newSubDesc} onChange={(e) => setNewSubDesc(e.target.value)} />
              <Button type="submit" size="sm">Create Subsection</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <SortableList
          items={mod.subsections}
          onReorder={handleReorderSubsections}
          renderItem={(sub, handle) => (
            <Card className="mb-4">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <DragHandle {...handle} />
                    <div className="min-w-0 flex-1">
                      {renamingSubId === sub.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            id={`rename-sub-${sub.id}`}
                            value={renameSubTitle}
                            onChange={(e) => setRenameSubTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveRenameSubsection(sub.id);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelRenameSubsection();
                              }
                            }}
                            autoFocus
                          />
                          <Button size="sm" onClick={() => saveRenameSubsection(sub.id)}>Save</Button>
                          <Button size="sm" variant="secondary" onClick={cancelRenameSubsection}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 truncate">{sub.title}</h3>
                          <button
                            type="button"
                            aria-label="Rename subsection"
                            onClick={() => startRenameSubsection(sub)}
                            className="text-gray-400 hover:text-gray-700 shrink-0"
                          >
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path d="M14.69 2.66a2.25 2.25 0 0 1 3.18 3.18l-9.9 9.9a2 2 0 0 1-.86.51l-3.7 1.06a.75.75 0 0 1-.93-.93l1.06-3.7a2 2 0 0 1 .51-.86l9.9-9.9zm2.12 1.06a.75.75 0 0 0-1.06 0l-1.13 1.13 1.06 1.06 1.13-1.13a.75.75 0 0 0 0-1.06z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {sub.description && renamingSubId !== sub.id && (
                        <p className="text-sm text-gray-500">{sub.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setAddingLessonTo(addingLessonTo === sub.id ? null : sub.id);
                      setNewLessonTitle("");
                    }}>
                      + Lesson
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteSubsection(sub.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {addingLessonTo === sub.id && (
                  <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex gap-2">
                    <Input
                      id="new-lesson"
                      placeholder="Lesson title"
                      value={newLessonTitle}
                      onChange={(e) => setNewLessonTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleCreateLesson(sub.id); }
                      }}
                    />
                    <Button size="sm" onClick={() => handleCreateLesson(sub.id)}>Add</Button>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  <SortableList
                    items={sub.lessons}
                    onReorder={(next) => handleReorderLessons(sub.id, next)}
                    renderItem={(lesson, lessonHandle) => (
                      <LessonRow
                        moduleId={moduleId}
                        lesson={lesson}
                        handle={lessonHandle}
                        onDelete={() => handleDeleteLesson(lesson.id)}
                      />
                    )}
                  />
                  {sub.lessons.length === 0 && (
                    <div className="px-6 py-4 text-sm text-gray-400 text-center">No lessons yet</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        />

        {mod.subsections.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No subsections yet. Add your first subsection above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function LessonRow({
  moduleId,
  lesson,
  handle,
  onDelete,
}: {
  moduleId: string;
  lesson: Lesson;
  handle: SortableHandleProps;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 bg-white">
      <div className="flex items-center gap-2">
        <DragHandle {...handle} />
        <span className="text-sm text-gray-900">{lesson.title}</span>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/admin/modules/${moduleId}/lessons/${lesson.id}/edit`}>
          <Button size="sm" variant="ghost">Edit Content</Button>
        </Link>
        <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
}
