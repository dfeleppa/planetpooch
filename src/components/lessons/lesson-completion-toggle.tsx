"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface LessonCompletionToggleProps {
  lessonId: string;
  isCompleted: boolean;
  onToggle: (isCompleted: boolean) => void;
}

export function LessonCompletionToggle({ lessonId, isCompleted, onToggle }: LessonCompletionToggleProps) {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checked, setChecked] = useState(isCompleted);

  async function toggleCompletion() {
    setLoading(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setChecked(data.isCompleted);
        onToggle(data.isCompleted);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    if (checked) {
      // Show confirmation before unchecking
      setShowConfirm(true);
    } else {
      toggleCompletion();
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          checked
            ? "bg-green-100 text-green-700 hover:bg-green-200"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        } disabled:opacity-50`}
      >
        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
          checked ? "bg-green-500 border-green-500 text-white" : "border-gray-400"
        }`}>
          {checked && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        {loading ? "Updating..." : checked ? "Completed" : "Mark as Complete"}
      </button>

      <ConfirmDialog
        open={showConfirm}
        title="Unmark Lesson as Complete?"
        message="Are you sure you want to mark this lesson as incomplete? This action will be recorded in the audit log and visible to administrators."
        confirmLabel="Yes, Unmark"
        cancelLabel="Keep Completed"
        variant="danger"
        onConfirm={() => {
          setShowConfirm(false);
          toggleCompletion();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
