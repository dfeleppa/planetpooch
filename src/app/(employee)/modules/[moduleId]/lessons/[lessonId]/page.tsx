"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LessonViewer } from "@/components/lessons/lesson-viewer";
import { LessonCompletionToggle } from "@/components/lessons/lesson-completion-toggle";
import { LessonNotes } from "@/components/lessons/lesson-notes";
import { Card, CardContent } from "@/components/ui/card";

interface LessonData {
  id: string;
  title: string;
  content: Record<string, unknown>;
  estimatedMinutes: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  module: { id: string; title: string; notesEnabled: boolean };
  subsectionTitle: string;
  prevLesson: { id: string; title: string } | null;
  nextLesson: { id: string; title: string } | null;
  nextModule: { id: string; title: string; firstLessonId: string } | null;
}

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.moduleId as string;
  const lessonId = params.lessonId as string;
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);

  // Track last visited lesson in a cookie so the module page can redirect to it
  useEffect(() => {
    document.cookie = `portal-last-lesson-${moduleId}=${lessonId}; path=/; max-age=${60 * 60 * 24 * 90}`;
  }, [moduleId, lessonId]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/lessons/${lessonId}`)
      .then((res) => res.json())
      .then((data) => {
        setLesson(data);
        setLoading(false);
      });
  }, [lessonId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">Loading lesson...</div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">Lesson not found</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/modules" className="hover:text-blue-600">Modules</Link>
        <span>/</span>
        <span className="text-gray-400">{lesson.subsectionTitle}</span>
        <span>/</span>
        <span className="text-gray-900">{lesson.title}</span>
      </div>

      {/* Title and completion */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
          {lesson.estimatedMinutes && (
            <p className="text-sm text-gray-500 mt-1">Estimated time: {lesson.estimatedMinutes} minutes</p>
          )}
        </div>
        <LessonCompletionToggle
          lessonId={lessonId}
          isCompleted={lesson.isCompleted}
          onToggle={(isCompleted) => {
            setLesson({ ...lesson, isCompleted });
            // Refresh server components so the module nav sidebar updates completion state
            router.refresh();
          }}
        />
      </div>

      {/* Lesson content */}
      <Card className="mt-6">
        <CardContent className="py-6">
          <LessonViewer content={lesson.content} />
        </CardContent>
      </Card>

      {/* Notes */}
      {lesson.module.notesEnabled && <LessonNotes lessonId={lessonId} />}

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
        {lesson.prevLesson ? (
          <Link
            href={`/modules/${moduleId}/lessons/${lesson.prevLesson.id}`}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {lesson.prevLesson.title}
          </Link>
        ) : (
          <div />
        )}
        {lesson.nextLesson ? (
          <Link
            href={`/modules/${moduleId}/lessons/${lesson.nextLesson.id}`}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            {lesson.nextLesson.title}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : lesson.nextModule ? (
          <Link
            href={`/modules/${lesson.nextModule.id}/lessons/${lesson.nextModule.firstLessonId}`}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Next module: {lesson.nextModule.title}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
