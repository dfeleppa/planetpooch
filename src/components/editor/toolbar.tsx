"use client";

import { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ToolbarProps {
  editor: Editor | null;
  onInsertEmbed: () => void;
}

export function Toolbar({ editor, onInsertEmbed }: ToolbarProps) {
  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-sm rounded transition-colors ${
        isActive
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Underline"
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        &bull; List
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Numbered List"
      >
        1. List
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Blockquote"
      >
        &ldquo; Quote
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title="Code Block"
      >
        {"</>"}
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        &#8212;
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Media */}
      <ToolbarButton
        onClick={() => {
          const url = window.prompt("Enter image URL:");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}
        title="Insert Image"
      >
        Image
      </ToolbarButton>
      <ToolbarButton onClick={onInsertEmbed} title="Insert Google Drive / YouTube Embed">
        Embed
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        Undo
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        Redo
      </ToolbarButton>
    </div>
  );
}
