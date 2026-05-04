"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { LinkableScript } from "@/lib/marketing/performance";

/**
 * Inline picker that opens from the "unlinked" / "↪ script" badge on each
 * row of the performance table. Writes a manual override via
 * /api/marketing/performance/link, then router.refresh() to re-render the
 * server component with the new link.
 */
export function AdLinkPicker({
  adId,
  adName,
  currentScriptId,
  currentScriptIdeaTitle,
  scripts,
}: {
  adId: string;
  adName: string;
  currentScriptId: string | null;
  currentScriptIdeaTitle: string | null;
  scripts: LinkableScript[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter(
      (s) =>
        s.ideaTitle.toLowerCase().includes(q) ||
        (s.metaAdSlug?.toLowerCase().includes(q) ?? false)
    );
  }, [scripts, query]);

  async function setLink(scriptId: string | null) {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/marketing/performance/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId, scriptId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setOpen(false);
      setQuery("");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isSubmitting || isPending;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center text-xs"
        aria-label={
          currentScriptId ? "Change linked script" : "Link this ad to a script"
        }
        aria-expanded={open}
      >
        {currentScriptId ? (
          <Badge variant="info">↪ {currentScriptIdeaTitle ?? "script"}</Badge>
        ) : (
          <Badge variant="default">unlinked</Badge>
        )}
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1 left-0 w-80 rounded-lg border border-gray-200 bg-white shadow-lg"
          role="dialog"
          aria-label="Link ad to script"
        >
          <div className="p-2 border-b border-gray-100">
            <p
              className="text-xs text-gray-500 truncate"
              title={adName}
            >
              {adName}
            </p>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scripts…"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={busy}
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-500 px-3 py-4 text-center">
                No scripts match.
              </p>
            ) : (
              <ul>
                {filtered.map((s) => {
                  const isCurrent = s.id === currentScriptId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setLink(s.id)}
                        disabled={busy || isCurrent}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="font-medium text-gray-900 truncate">
                          {s.ideaTitle}
                          {isCurrent && (
                            <span className="ml-2 text-xs text-gray-500">
                              (current)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span>{s.platform}</span>
                          <span>·</span>
                          <span>{s.status}</span>
                          {s.metaAdSlug && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{s.metaAdSlug}</span>
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {currentScriptId && (
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={() => setLink(null)}
                disabled={busy}
                className="w-full text-left px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              >
                Unlink (revert to auto-matcher)
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 px-3 py-2 border-t border-gray-100">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
