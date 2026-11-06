"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previouslyFocused = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-pp-line bg-white p-6 text-pp-ink shadow-xl backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}>
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm text-pp-ink-3">{message}</p>
        <div className="mt-4 flex justify-end gap-3">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
    </dialog>
  );
}
