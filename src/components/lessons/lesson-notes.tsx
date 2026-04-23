"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface LessonNotesProps {
  lessonId: string;
}

export function LessonNotes({ lessonId }: LessonNotesProps) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch(`/api/lessons/${lessonId}/notes`)
      .then((res) => res.json())
      .then((data) => {
        setContent(data.content || "");
        if (data.content) setExpanded(true);
      });
  }, [lessonId]);

  const saveNote = useCallback(
    async (text: string) => {
      setSaving(true);
      try {
        await fetch(`/api/lessons/${lessonId}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } finally {
        setSaving(false);
      }
    },
    [lessonId]
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    setSaved(false);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => saveNote(val), 800);
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        My Notes
        {saving && <span className="text-gray-400 text-xs">Saving...</span>}
        {saved && <span className="text-green-500 text-xs">Saved</span>}
      </button>

      {expanded && (
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Write your notes here..."
          className="mt-2 w-full rounded-lg border border-gray-200 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[120px] resize-y"
        />
      )}
    </div>
  );
}
