"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "MARKETING";
type Company = "RESORT" | "GROOMING" | "CORPORATE";
type Article = {
  id: string;
  title: string;
  content: string;
  category: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  company: Company | null;
  allowedRoles: Role[];
  isPublished: boolean;
  updatedAt: string;
};
type ArticleSummary = Pick<Article, "id" | "title" | "category" | "company" | "allowedRoles" | "isPublished" | "updatedAt">;

const emptyArticle: Omit<Article, "updatedAt"> = {
  id: "", title: "", content: "", category: "General", sourceLabel: null,
  sourceUrl: null, sourceUpdatedAt: null, company: null, allowedRoles: ["SUPER_ADMIN"], isPublished: false,
};
const roleOptions: { role: Role; label: string }[] = [
  { role: "EMPLOYEE", label: "Employee role" },
  { role: "MANAGER", label: "Manager role" },
  { role: "MARKETING", label: "Marketing role" },
  { role: "SUPER_ADMIN", label: "Super admins" },
];

export function KnowledgeEditor() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [editing, setEditing] = useState<Omit<Article, "updatedAt"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadArticles() {
    const response = await fetch("/api/knowledge/articles");
    if (!response.ok) throw new Error("Could not load knowledge articles.");
    setArticles(await response.json());
  }

  useEffect(() => {
    let active = true;
    fetch("/api/knowledge/articles")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load knowledge articles.");
        return response.json();
      })
      .then((data) => { if (active) setArticles(data); })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function editArticle(id: string) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/knowledge/articles?id=${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Could not open this article.");
      setEditing(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this article.");
    }
  }

  function update<K extends keyof Omit<Article, "updatedAt">>(key: K, value: Omit<Article, "updatedAt">[K]) {
    setEditing((current) => current ? { ...current, [key]: value } : current);
  }

  function toggleRole(role: Role) {
    if (!editing) return;
    const selected = editing.allowedRoles.includes(role);
    const next = selected ? editing.allowedRoles.filter((item) => item !== role) : [...editing.allowedRoles, role];
    update("allowedRoles", next.length ? next : ["SUPER_ADMIN"]);
  }

  async function loadTextFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 150_000) {
      setError("Choose a text, Markdown, or CSV file under 150 KB.");
      return;
    }
    const content = await file.text();
    if (content.length > 100_000) {
      setError("This file is too long for one article. Split it into smaller sections.");
      return;
    }
    setEditing((current) => current ? {
      ...current,
      title: current.title || file.name.replace(/\.(txt|md|csv)$/i, "").replace(/[_-]/g, " "),
      content,
      sourceLabel: current.sourceLabel || file.name,
      isPublished: false,
    } : current);
    setError("");
    setSuccess("File loaded as a draft. Review the content and access roles before saving.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/knowledge/articles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, id: editing.id || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the article.");
      await loadArticles();
      setEditing(data);
      setSuccess(data.isPublished ? "Published and available to selected roles." : "Draft saved. It is not available in chat yet.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the article.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-pp-accent">Experimental</p>
          <h1 className="mt-1 text-2xl font-semibold text-pp-ink">Knowledge library</h1>
          <p className="mt-1 text-sm text-pp-ink-3">Add verified Planet Pooch information for <Link href="/knowledge" className="text-pp-accent underline">Ask Pooch</Link>.</p>
        </div>
        <button type="button" onClick={() => { setEditing({ ...emptyArticle }); setError(""); setSuccess(""); }}
          className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-medium text-white hover:bg-pp-accent-2">New article</button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section className="rounded-xl border border-pp-line bg-white p-4">
          <h2 className="mb-3 font-semibold text-pp-ink">Articles</h2>
          {loading && <p className="text-sm text-pp-ink-3">Loading…</p>}
          {!loading && articles.length === 0 && <p className="text-sm text-pp-ink-3">No articles yet. Add a policy, procedure, or reference note.</p>}
          <div className="max-h-[70vh] space-y-2 overflow-y-auto">
            {articles.map((article) => (
              <button key={article.id} type="button" onClick={() => void editArticle(article.id)}
                className="w-full rounded-lg border border-pp-line p-3 text-left hover:border-pp-accent-line hover:bg-pp-accent-soft">
                <span className="block font-medium text-pp-ink">{article.title}</span>
                <span className="mt-1 block text-xs text-pp-ink-3">
                  {article.category} · {article.company ?? "Both businesses"} · {article.isPublished ? "Published" : "Draft"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-pp-line bg-white p-5">
          {!editing ? <p className="text-sm text-pp-ink-3">Select an article or create a new one.</p> : (
            <form onSubmit={save} className="space-y-4">
              <h2 className="text-lg font-semibold text-pp-ink">{editing.id ? "Edit article" : "New article"}</h2>
              <label className="block text-sm font-medium text-pp-ink-2">Title
                <input required minLength={3} maxLength={180} value={editing.title} onChange={(event) => update("title", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-pp-ink-2">Category
                  <input required minLength={2} maxLength={80} value={editing.category} onChange={(event) => update("category", event.target.value)}
                    className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium text-pp-ink-2">Business
                  <select value={editing.company ?? ""} onChange={(event) => update("company", (event.target.value || null) as Company | null)}
                    className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm">
                    <option value="">Both businesses</option><option value="RESORT">Pet Resort</option><option value="GROOMING">Mobile Grooming</option><option value="CORPORATE">Corporate</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-pp-ink-2">Content
                <textarea required minLength={10} maxLength={100000} rows={15} value={editing.content} onChange={(event) => update("content", event.target.value)}
                  placeholder="Paste the approved policy, procedure, or reference text here."
                  className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm leading-6" />
              </label>
              <label className="block text-sm text-pp-ink-2">Or load a text, Markdown, or CSV file
                <input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                  onChange={(event) => void loadTextFile(event.target.files?.[0])}
                  className="mt-1 block w-full text-xs text-pp-ink-3" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-pp-ink-2">Source name
                  <input maxLength={180} value={editing.sourceLabel ?? ""} onChange={(event) => update("sourceLabel", event.target.value || null)}
                    className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium text-pp-ink-2">Source link
                  <input type="url" value={editing.sourceUrl ?? ""} onChange={(event) => update("sourceUrl", event.target.value || null)}
                    className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="block text-sm font-medium text-pp-ink-2">Original source last updated (if known)
                <input type="date" value={editing.sourceUpdatedAt?.slice(0, 10) ?? ""}
                  onChange={(event) => update("sourceUpdatedAt", event.target.value || null)}
                  className="mt-1 w-full rounded-lg border border-pp-line px-3 py-2 text-sm" />
              </label>
              <fieldset className="rounded-lg border border-pp-line p-3">
                <legend className="px-1 text-sm font-medium text-pp-ink-2">Who can ask about this?</legend>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                  {roleOptions.map(({ role, label }) => (
                    <label key={role} className="flex items-center gap-2 text-sm text-pp-ink-2">
                      <input type="checkbox" checked={editing.allowedRoles.includes(role)} onChange={() => toggleRole(role)} />{label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-pp-ink-4">Select every role that should see this article. Super admins can always review published articles. Drafts are visible only here.</p>
              </fieldset>
              <label className="flex items-center gap-2 text-sm font-medium text-pp-ink-2">
                <input type="checkbox" checked={editing.isPublished} onChange={(event) => update("isPublished", event.target.checked)} />Publish to Ask Pooch
              </label>
              {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
              {success && <p className="text-sm text-pp-ok" role="status">{success}</p>}
              <button type="submit" disabled={saving} className="rounded-lg bg-pp-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-pp-accent-2 disabled:opacity-50">
                {saving ? "Saving…" : "Save article"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
