"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useCallback } from "react";
import { Toolbar } from "./toolbar";
import { InsertEmbedDialog } from "./insert-embed-dialog";
import { GoogleDriveEmbed } from "./extensions/google-drive-embed";

interface TiptapEditorProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
  placeholder?: string;
}

export function TiptapEditor({ content, onChange, placeholder = "Start writing your lesson content..." }: TiptapEditorProps) {
  const [showEmbedDialog, setShowEmbedDialog] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      GoogleDriveEmbed,
    ],
    content: content && Object.keys(content).length > 0 ? content : undefined,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "tiptap prose max-w-none p-4 focus:outline-none min-h-[400px]",
      },
    },
  });

  const handleInsertEmbed = useCallback(
    (embedUrl: string) => {
      if (!editor) return;
      editor.chain().focus().setGoogleDriveEmbed({ src: embedUrl }).run();
    },
    [editor]
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <Toolbar editor={editor} onInsertEmbed={() => setShowEmbedDialog(true)} />
      <EditorContent editor={editor} />
      <InsertEmbedDialog
        open={showEmbedDialog}
        onClose={() => setShowEmbedDialog(false)}
        onInsert={handleInsertEmbed}
      />
    </div>
  );
}
