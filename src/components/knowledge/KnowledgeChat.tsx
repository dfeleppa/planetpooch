"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Source = { id: string; title: string; kind: "article" | "lesson"; url: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const SUGGESTIONS = [
  "What are the Floor Lead's duties?",
  "How do I do laundry?",
  "What does the front desk handle?",
];

export function KnowledgeChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/knowledge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-9).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The assistant is unavailable right now.");
      setMessages([...next, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assistant is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rounded-2xl border border-pp-line bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-pp-ink">Ask Pooch</h1>
          <span className="rounded-full border border-pp-accent-line bg-pp-accent-soft px-2.5 py-1 text-xs font-medium text-pp-accent">Experimental</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-pp-ink-3">
          Ask about Planet Pooch procedures and information. Answers use sources you are allowed to see.
          Check the linked sources before acting on sensitive or time critical details.
        </p>
      </header>

      <div className="min-h-72 space-y-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-pp-line bg-pp-surface-2 p-6">
            <p className="font-medium text-pp-ink">Try a question</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void ask(suggestion)}
                  className="rounded-full border border-pp-line bg-white px-3 py-2 text-left text-sm text-pp-ink-2 hover:border-pp-accent-line hover:text-pp-accent">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`rounded-2xl border p-5 ${message.role === "user" ? "ml-8 border-pp-accent-line bg-pp-accent-soft" : "mr-8 border-pp-line bg-white"}`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pp-ink-4">{message.role === "user" ? "You" : "Ask Pooch"}</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-pp-ink">{message.content}</p>
            {message.sources && message.sources.length > 0 && (
              <div className="mt-5 border-t border-pp-line pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pp-ink-4">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {message.sources.map((source, sourceIndex) => (
                    <Link key={source.id} href={source.url} className="rounded-md border border-pp-line px-3 py-1.5 text-xs text-pp-accent hover:bg-pp-accent-soft">
                      [{sourceIndex + 1}] {source.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="px-2 text-sm text-pp-ink-3" role="status">Looking through the knowledge library…</p>}
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-3 rounded-2xl border border-pp-line bg-white p-3 shadow-lg">
        <label htmlFor="knowledge-question" className="sr-only">Your question</label>
        <div className="flex items-end gap-3">
          <textarea id="knowledge-question" rows={2} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); } }}
            placeholder="Ask a Planet Pooch question…"
            className="min-h-16 flex-1 resize-y rounded-lg border border-pp-line px-3 py-2 text-sm text-pp-ink outline-none focus:border-pp-accent" />
          <button type="submit" disabled={busy || !draft.trim()} className="rounded-lg bg-pp-accent px-5 py-3 text-sm font-medium text-white hover:bg-pp-accent-2 disabled:opacity-50">
            Ask
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      </form>
    </div>
  );
}
