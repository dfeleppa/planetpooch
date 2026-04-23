"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { GoogleDriveEmbed } from "@/components/editor/extensions/google-drive-embed";

interface LessonViewerProps {
  content: Record<string, unknown>;
}

export function LessonViewer({ content }: LessonViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Image,
      GoogleDriveEmbed,
    ],
    content: content && Object.keys(content).length > 0 ? content : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "No content yet." }] }] },
    editable: false,
    immediatelyRender: false,
  });

  return (
    <div className="lesson-content">
      <EditorContent editor={editor} />
    </div>
  );
}
