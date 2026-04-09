"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function EditLessonPage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.moduleId as string;
  const lessonId = params.lessonId as string;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/lessons/${lessonId}`)
      .then((res) => res.json())
      .then((data) => {
        setTitle(data.title);
        setContent(data.content || {});
        setEstimatedMinutes(data.estimatedMinutes?.toString() || "");
        setLoading(false);
      });
  }, [lessonId]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/lessons/${lessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="text-gray-500">Loading editor...</div>;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/admin/modules" className="hover:text-blue-600">Modules</Link>
        <span>/</span>
        <Link href={`/admin/modules/${moduleId}`} className="hover:text-blue-600">Module</Link>
        <span>/</span>
        <span className="text-gray-900">Edit Lesson</span>
      </div>

      {/* Title and settings */}
      <div className="flex items-end gap-4 mb-6">
        <div className="flex-1">
          <Input id="lesson-title" label="Lesson Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="w-40">
          <Input
            id="estimated-minutes"
            label="Est. Minutes"
            type="number"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            placeholder="e.g. 15"
          />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>

      {/* Editor */}
      <TiptapEditor content={content} onChange={setContent} />
    </div>
  );
}
