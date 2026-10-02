"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KnowledgeChat } from "./KnowledgeChat";

export function AskPoochWidget() {
  const pathname = usePathname();
  const [view, setView] = useState<"closed" | "expanded" | "minimized">("closed");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const minimizedRef = useRef<HTMLButtonElement>(null);
  const onKnowledgePage = pathname === "/knowledge" || pathname.startsWith("/knowledge/");
  const shouldOpen = view === "expanded" && !onKnowledgePage;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shouldOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("textarea")?.focus();
    } else if (!shouldOpen && dialog.open) {
      dialog.close();
    }
    if (view === "minimized" && !onKnowledgePage) {
      minimizedRef.current?.focus();
    }
  }, [shouldOpen, view, onKnowledgePage]);

  return (
    <>
      {view === "closed" && !onKnowledgePage && <button
        type="button"
        onClick={() => setView("expanded")}
        aria-haspopup="dialog"
        aria-expanded={false}
        aria-controls="ask-pooch-widget-dialog"
        className="fixed bottom-4 right-4 z-40 rounded-full bg-pp-accent px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-pp-accent-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-accent sm:bottom-6 sm:right-6 print:hidden"
      >
        <span aria-hidden="true">✦</span> Ask Pooch
      </button>}
      {view === "minimized" && !onKnowledgePage && <div
        role="group"
        aria-label="Minimized Ask Pooch"
        className="fixed bottom-4 right-4 z-40 flex w-[min(28rem,calc(100vw-2rem))] items-center gap-2 rounded-xl border border-pp-line bg-white p-2 pl-4 text-pp-ink shadow-lg sm:bottom-6 sm:right-6 print:hidden"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">✦ Ask Pooch</span>
        <button
          ref={minimizedRef}
          type="button"
          onClick={() => setView("expanded")}
          aria-haspopup="dialog"
          aria-controls="ask-pooch-widget-dialog"
          className="rounded-lg px-3 py-2 text-sm font-medium text-pp-accent hover:bg-pp-surface-2 focus-visible:outline-2 focus-visible:outline-pp-accent"
        >
          Expand
        </button>
        <button
          type="button"
          onClick={() => setView("closed")}
          aria-label="Close Ask Pooch"
          className="rounded-lg px-2 py-1 text-xl text-pp-ink-3 hover:bg-pp-surface-2 hover:text-pp-ink focus-visible:outline-2 focus-visible:outline-pp-accent"
        >
          ×
        </button>
      </div>}
      <dialog
        id="ask-pooch-widget-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          setView("closed");
        }}
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
              <Link href="/knowledge" onClick={() => setView("closed")} className="text-xs font-medium text-pp-accent hover:underline">
                Full page
              </Link>
              <button
                type="button"
                onClick={() => setView("minimized")}
                aria-label="Minimize Ask Pooch"
                className="rounded-lg px-2 py-1 text-xl text-pp-ink-3 hover:bg-pp-surface-2 hover:text-pp-ink focus-visible:outline-2 focus-visible:outline-pp-accent"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setView("closed")}
                aria-label="Close Ask Pooch"
                className="rounded-lg px-2 py-1 text-xl text-pp-ink-3 hover:bg-pp-surface-2 hover:text-pp-ink focus-visible:outline-2 focus-visible:outline-pp-accent"
              >
                ×
              </button>
            </div>
          </header>
          <KnowledgeChat compact onSourceNavigate={() => setView("closed")} />
        </div>
      </dialog>
    </>
  );
}
