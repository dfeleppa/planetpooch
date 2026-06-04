"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DragHandle } from "@/components/SortableList";

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

interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  icon: string | null;
  totalLessons: number;
  completedLessons: number;
  subsections?: Subsection[];
}

const MODULE_DROP_PREFIX = "module-drop:";
const LESSON_DROP_PREFIX = "lesson-drop:";

export default function AdminModulesPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const jobTitle = session?.user?.jobTitle;
  const canDeleteModules =
    role === "SUPER_ADMIN" || role === "ADMIN" || jobTitle === "CMO";

  const [modules, setModules] = useState<Module[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [notesEnabled, setNotesEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const moduleIds = useMemo(() => modules.map((mod) => mod.id), [modules]);

  async function loadModules() {
    const res = await fetch("/api/modules");
    const data = await res.json();
    setModules(data);
    setExpandedIds(new Set());
    setLoading(false);
  }

  async function loadModuleContent(moduleId: string) {
    const res = await fetch(`/api/modules/${moduleId}`);
    if (!res.ok) return;
    const data = await res.json();
    setModules((current) =>
      current.map((mod) =>
        mod.id === moduleId
          ? { ...mod, subsections: data.subsections, totalLessons: countLessons(data.subsections) }
          : mod,
      ),
    );
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialModules() {
      const res = await fetch("/api/modules");
      const data = await res.json();
      if (ignore) return;
      setModules(data);
      setLoading(false);
    }

    loadInitialModules();

    return () => {
      ignore = true;
    };
  }, []);

  async function toggleExpanded(moduleId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });

    const mod = modules.find((item) => item.id === moduleId);
    if (!mod?.subsections) await loadModuleContent(moduleId);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, icon: icon || null, notesEnabled }),
    });
    if (res.ok) {
      setTitle("");
      setDescription("");
      setIcon("");
      setNotesEnabled(true);
      setShowCreate(false);
      loadModules();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this module and all its content?")) return;
    await fetch(`/api/modules/${id}`, { method: "DELETE" });
    loadModules();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === "module" && overType === "module") {
      const oldIndex = modules.findIndex((mod) => mod.id === active.id);
      const newIndex = modules.findIndex((mod) => mod.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(modules, oldIndex, newIndex);
      setModules(next);
      await saveOrganization({ moduleIds: next.map((mod) => mod.id) });
      return;
    }

    if (activeType === "subsection") {
      await moveSubsection(String(active.id), String(over.id), overType);
      return;
    }

    if (activeType === "lesson") {
      await moveLesson(String(active.id), String(over.id), overType);
    }
  }

  async function moveSubsection(subsectionId: string, overId: string, overType: string | undefined) {
    const source = findSubsection(modules, subsectionId);
    const targetModuleId = getTargetModuleId(overId, overType);
    if (!source || !targetModuleId) return;

    const affectedModuleIds = [source.moduleId, targetModuleId];
    let nextModules: Module[] = removeSubsection(modules, subsectionId);
    const targetModule = nextModules.find((mod) => mod.id === targetModuleId);
    if (!targetModule?.subsections) return;

    const targetIndex =
      overType === "subsection"
        ? Math.max(0, targetModule.subsections.findIndex((sub) => sub.id === overId))
        : targetModule.subsections.length;

    nextModules = nextModules.map((mod) => {
      if (mod.id !== targetModuleId || !mod.subsections) return mod;
      const nextSubsections = [...mod.subsections];
      nextSubsections.splice(targetIndex, 0, source.subsection);
      return { ...mod, subsections: normalizeOrder(nextSubsections) };
    });

    nextModules = normalizeModuleLessonCounts(nextModules, affectedModuleIds);
    setModules(nextModules);
    await saveOrganization({
      subsectionsByModule: buildSubsectionPayload(nextModules, affectedModuleIds),
    });
  }

  async function moveLesson(lessonId: string, overId: string, overType: string | undefined) {
    const source = findLesson(modules, lessonId);
    const targetSubsectionId = getTargetSubsectionId(overId, overType);
    if (!source || !targetSubsectionId) return;

    let nextModules: Module[] = removeLesson(modules, lessonId);
    const target = findSubsection(nextModules, targetSubsectionId);
    if (!target) return;

    const targetIndex =
      overType === "lesson"
        ? Math.max(0, target.subsection.lessons.findIndex((lesson) => lesson.id === overId))
        : target.subsection.lessons.length;

    nextModules = nextModules.map((mod) => ({
      ...mod,
      subsections: mod.subsections?.map((sub) => {
        if (sub.id !== targetSubsectionId) return sub;
        const lessons = [...sub.lessons];
        lessons.splice(targetIndex, 0, source.lesson);
        return { ...sub, lessons: normalizeOrder(lessons) };
      }),
    }));

    const affectedSubsectionIds = [source.subsectionId, targetSubsectionId];
    const affectedModuleIds = [source.moduleId, target.moduleId];
    nextModules = normalizeModuleLessonCounts(nextModules, affectedModuleIds);
    setModules(nextModules);
    await saveOrganization({
      lessonsBySubsection: buildLessonPayload(nextModules, affectedSubsectionIds),
    });
  }

  async function saveOrganization(body: {
    moduleIds?: string[];
    subsectionsByModule?: Record<string, string[]>;
    lessonsBySubsection?: Record<string, string[]>;
  }) {
    setSaving(true);
    const res = await fetch("/api/modules/organize", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) loadModules();
  }

  function getTargetModuleId(overId: string, overType: string | undefined) {
    if (overType === "subsection") return findSubsection(modules, overId)?.moduleId ?? null;
    if (overType === "module-drop") return overId.replace(MODULE_DROP_PREFIX, "");
    if (overType === "module") return overId;
    return null;
  }

  function getTargetSubsectionId(overId: string, overType: string | undefined) {
    if (overType === "lesson") return findLesson(modules, overId)?.subsectionId ?? null;
    if (overType === "lesson-drop") return overId.replace(LESSON_DROP_PREFIX, "");
    if (overType === "subsection") return overId;
    return null;
  }

  if (loading) {
    return <div className="text-gray-500">Loading modules...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Modules</h1>
          <p className="text-gray-500 mt-1">Create, edit, and organize training modules</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {saving && <span className="text-sm text-gray-400">Saving...</span>}
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "New Module"}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="mt-4">
          <CardContent className="py-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <Input id="description" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input id="icon" label="Icon (emoji)" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. 📚" />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={notesEnabled}
                  onChange={(e) => setNotesEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Enable &quot;My Notes&quot; for this module
              </label>
              <Button type="submit">Create Module</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={moduleIds} strategy={verticalListSortingStrategy}>
          <div className="grid gap-4 mt-6">
            {modules.map((mod) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                expanded={expandedIds.has(mod.id)}
                canDelete={canDeleteModules}
                onToggle={() => toggleExpanded(mod.id)}
                onDelete={() => handleDelete(mod.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {modules.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-8 text-center text-gray-500">
            No modules yet. Create your first module above.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ModuleCard({
  mod,
  expanded,
  canDelete,
  onToggle,
  onDelete,
}: {
  mod: Module;
  expanded: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mod.id, data: { type: "module" } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 10 : "auto",
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <DragHandle
                attributes={attributes}
                listeners={listeners}
                isDragging={isDragging}
              />
              <button
                type="button"
                aria-label={expanded ? "Collapse module" : "Expand module"}
                onClick={onToggle}
                className="mt-1 sm:mt-0 h-7 w-7 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              >
                <span aria-hidden="true">{expanded ? "-" : "+"}</span>
              </button>
              {mod.icon && <span className="text-2xl flex-shrink-0">{mod.icon}</span>}
              <div className="min-w-0">
                <Link href={`/admin/modules/${mod.id}`} className="text-lg font-medium text-gray-900 hover:text-blue-600 break-words">
                  {mod.title}
                </Link>
                {mod.description && <p className="text-sm text-gray-500">{mod.description}</p>}
                <p className="text-xs text-gray-400 mt-1">{mod.totalLessons} lessons</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
              <Link href={`/admin/modules/${mod.id}`}>
                <Button variant="secondary" size="sm">Edit</Button>
              </Link>
              {canDelete && (
                <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
              )}
            </div>
          </div>
          {expanded && (
            <ModuleContents moduleId={mod.id} subsections={mod.subsections ?? []} loaded={mod.subsections !== undefined} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ModuleContents({
  moduleId,
  subsections,
  loaded,
}: {
  moduleId: string;
  subsections: Subsection[];
  loaded: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: `${MODULE_DROP_PREFIX}${moduleId}`,
    data: { type: "module-drop" },
  });

  if (!loaded) {
    return <div className="mt-4 text-sm text-gray-400">Loading...</div>;
  }

  return (
    <div ref={setNodeRef} className="mt-4 border-t border-gray-100 pt-4 space-y-3">
      <SortableContext items={subsections.map((sub) => sub.id)} strategy={verticalListSortingStrategy}>
        {subsections.map((sub) => (
          <SubsectionCard key={sub.id} moduleId={moduleId} subsection={sub} />
        ))}
      </SortableContext>
      {subsections.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-400">
          No subsections
        </div>
      )}
    </div>
  );
}

function SubsectionCard({ moduleId, subsection }: { moduleId: string; subsection: Subsection }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: subsection.id,
    data: { type: "subsection", moduleId },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `${LESSON_DROP_PREFIX}${subsection.id}`,
    data: { type: "lesson-drop", moduleId, subsectionId: subsection.id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 10 : "auto",
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center gap-2 px-4 py-3">
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          isDragging={isDragging}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{subsection.title}</div>
          {subsection.description && <div className="text-xs text-gray-500 truncate">{subsection.description}</div>}
        </div>
      </div>
      <div ref={setDropRef} className="border-t border-gray-200 bg-white">
        <SortableContext items={subsection.lessons.map((lesson) => lesson.id)} strategy={verticalListSortingStrategy}>
          {subsection.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} moduleId={moduleId} subsectionId={subsection.id} />
          ))}
        </SortableContext>
        {subsection.lessons.length === 0 && (
          <div className="px-10 py-3 text-sm text-gray-400">No lessons</div>
        )}
      </div>
    </div>
  );
}

function LessonRow({
  lesson,
  moduleId,
  subsectionId,
}: {
  lesson: Lesson;
  moduleId: string;
  subsectionId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lesson.id,
    data: { type: "lesson", moduleId, subsectionId },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 10 : "auto",
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-8 py-3 border-b border-gray-100 last:border-b-0 bg-white">
      <DragHandle
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
      />
      <span className="min-w-0 flex-1 text-sm text-gray-900 truncate">{lesson.title}</span>
      <Link href={`/admin/modules/${moduleId}/lessons/${lesson.id}/edit`}>
        <Button size="sm" variant="ghost">Edit</Button>
      </Link>
    </div>
  );
}

function findSubsection(modules: Module[], subsectionId: string) {
  for (const mod of modules) {
    const index = mod.subsections?.findIndex((sub) => sub.id === subsectionId) ?? -1;
    if (index >= 0 && mod.subsections) {
      return { moduleId: mod.id, subsection: mod.subsections[index], index };
    }
  }
  return null;
}

function findLesson(modules: Module[], lessonId: string) {
  for (const mod of modules) {
    for (const sub of mod.subsections ?? []) {
      const index = sub.lessons.findIndex((lesson) => lesson.id === lessonId);
      if (index >= 0) {
        return {
          moduleId: mod.id,
          subsectionId: sub.id,
          lesson: sub.lessons[index],
          index,
        };
      }
    }
  }
  return null;
}

function removeSubsection(modules: Module[], subsectionId: string) {
  return modules.map((mod) => ({
    ...mod,
    subsections: mod.subsections
      ? normalizeOrder(mod.subsections.filter((sub) => sub.id !== subsectionId))
      : undefined,
  }));
}

function removeLesson(modules: Module[], lessonId: string) {
  return modules.map((mod) => ({
    ...mod,
    subsections: mod.subsections?.map((sub) => ({
      ...sub,
      lessons: normalizeOrder(sub.lessons.filter((lesson) => lesson.id !== lessonId)),
    })),
  }));
}

function normalizeOrder<T extends { order: number }>(items: T[]) {
  return items.map((item, index) => ({ ...item, order: index }));
}

function countLessons(subsections: Subsection[]) {
  return subsections.reduce((total, sub) => total + sub.lessons.length, 0);
}

function normalizeModuleLessonCounts(modules: Module[], moduleIds: string[]) {
  const ids = new Set(moduleIds);
  return modules.map((mod) =>
    ids.has(mod.id) && mod.subsections
      ? { ...mod, totalLessons: countLessons(mod.subsections) }
      : mod,
  );
}

function buildSubsectionPayload(modules: Module[], moduleIds: string[]) {
  const ids = new Set(moduleIds);
  return Object.fromEntries(
    modules
      .filter((mod) => ids.has(mod.id) && mod.subsections)
      .map((mod) => [mod.id, mod.subsections!.map((sub) => sub.id)]),
  );
}

function buildLessonPayload(modules: Module[], subsectionIds: string[]) {
  const ids = new Set(subsectionIds);
  const entries: [string, string[]][] = [];
  for (const mod of modules) {
    for (const sub of mod.subsections ?? []) {
      if (ids.has(sub.id)) entries.push([sub.id, sub.lessons.map((lesson) => lesson.id)]);
    }
  }
  return Object.fromEntries(entries);
}
