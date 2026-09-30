"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KnowledgeChat } from "./KnowledgeChat";

export function AskPoochWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onKnowledgePage = pathname === "/knowledge" || pathname.startsWith("/knowledge/");
  const shouldOpen = open && !onKnowledgePage;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shouldOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("textarea")?.focus();
    } else if (!shouldOpen && dialog.open) {
      dialog.close();
    }
  }, [shouldOpen]);

  return (
    <>
      {!onKnowledgePage && <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={shouldOpen}
        aria-controls="ask-pooch-widget-dialog"
        className="fixed bottom-4 right-4 z-40 rounded-full bg-pp-accent px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-pp-accent-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-accent sm:bottom-6 sm:right-6 print:hidden"
      >
        <span aria-hidden="true">✦</span> Ask Pooch
      </button>}
      <dialog
        id="ask-pooch-widget-dialog"
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="ask-pooch-widget-title"
        className="fixed bottom-0 left-0 right-0 top-auto m-0 h-[min(38rem,calc(100dvh-3rem))] w-full max-h-none max-w-none overflow-hidden rounded-t-2xl border border-pp-line bg-white p-0 text-pp-ink shadow-2xl backdrop:bg-black/30 sm:bottom-24 sm:left-auto sm:right-6 sm:h-[min(38rem,calc(100dvh-8rem))] sm:w-[min(28rem,calc(100vw-3rem))] sm:rounded-2xl print:hidden"
      >
        <div className="flex h-full min-h-0 flex-col p-4">
          <header className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-pp-line pb-3">
            <div>
              <h2 id="ask-pooch-widget-title" className="text-lg font-semibold">Ask Pooch</h2>
              <p className="text-xs text-pp-ink-3">Experimental · Check linked sources for sensitive details</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/knowledge" onClick={() => setOpen(false)} className="text-xs font-medium text-pp-accent hover:underline">
                Full page
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Ask Pooch"
                className="rounded-lg px-2 py-1 text-xl text-pp-ink-3 hover:bg-pp-surface-2 hover:text-pp-ink focus-visible:outline-2 focus-visible:outline-pp-accent"
              >
                ×
              </button>
            </div>
          </header>
          <KnowledgeChat compact onSourceNavigate={() => setOpen(false)} />
        </div>
      </dialog>
    </>
  );
}
