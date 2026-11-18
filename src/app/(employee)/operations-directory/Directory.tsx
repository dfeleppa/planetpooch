import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

import { downtimeLists } from "@/lib/downtime";

const contactCategories = [
  ["facility-service-providers", "Facility Service Providers"],
  ["supply-vendors", "Supply Vendors"],
  ["utilities", "Utilities"],
] as const;

interface Category {
  title: string;
  source: string;
  description: string;
  rules: string[];
  columns: string[];
  rows: string[][];
}

function ContactValue({ value, label }: { value: string; label: string }) {
  const parts = value.split(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:1-)?(?:\(\d{3}\) |\d{3}-)\d{3}-\d{4}|\b911\b|[\w-]+\.(?:com|net|org)(?:\/[\w-]+)?)/g);
  return parts.map((part, index) => {
    let href: string | undefined;
    if (/^[\w.+-]+@/.test(part) && label !== "Login") href = "mailto:" + part;
    else if (/^(?:1-|\(|\d{3}-|911$)/.test(part)) href = "tel:" + part.replace(/\D/g, "");
    else if (label === "Website" && /^[\w-]+\.(com|net|org)\b/.test(part)) href = "https://" + part;
    return href ? <a key={index} href={href} className="text-pp-accent underline underline-offset-2">{part}</a> : part;
  });
}

export default async function Directory({ slug }: { slug: string }) {
  await requireAuth();
  const tasks = downtimeLists.some(item => item.slug === slug);
  const categories = tasks
    ? downtimeLists.map(({ slug, label, href }) => [slug, label, href + "?company=RESORT"])
    : contactCategories.map(([key, label]) => [key, label, "/operations-directory/" + key]);
  if (!categories.some(([key]) => key === slug)) notFound();
  const data = process.env.OPERATIONS_DIRECTORY_CONTENT;
  if (!data) throw new Error("Operations directory content is unavailable");
  const category: Category = JSON.parse(data)[slug];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <h1 className="text-3xl font-semibold text-pp-ink">{tasks ? "Pet Resort Downtime" : "Operations Directory"}</h1>
      <nav aria-label={tasks ? "Downtime lists" : "Directory categories"} className="flex flex-wrap gap-1 rounded-xl border border-pp-line bg-pp-surface-2 p-1">
        {categories.map(([key, label, href]) => (
          <Link key={key} href={href} aria-current={key === slug ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 ${key === slug ? "bg-pp-ink text-white" : "text-pp-ink hover:bg-white"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <section className="space-y-5" aria-labelledby="category-title">
        <header className="space-y-1">
          <p className="text-sm text-pp-ink-3">{category.source}</p>
          <h2 id="category-title" className="text-2xl font-semibold">{category.title}</h2>
          <p className="text-pp-ink-2">{category.description}</p>
        </header>
        {tasks ? (
          <>
            <ul className="list-disc space-y-2 rounded-xl border border-pp-line bg-pp-surface-2 py-4 pl-9 pr-4">
              {category.rules.map(rule => <li key={rule}>{rule}</li>)}
            </ul>
            <ol className="divide-y divide-pp-line rounded-xl border border-pp-line bg-white">
              {category.rows.map(([rank, task, time]) => {
                const split = task.indexOf(". ");
                return <li key={rank} className="flex gap-3 p-4">
                  <span className="font-semibold tabular-nums text-pp-ink-3">{rank}.</span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <h3 className="font-semibold">{task.slice(0, split)}</h3>
                      {time && <span className="text-sm text-pp-ink-3">{time}</span>}
                    </div>
                    <p className="mt-1 text-pp-ink-2">{task.slice(split + 2)}</p>
                  </div>
                </li>;
              })}
            </ol>
          </>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {category.rows.map(([heading, ...fields]) => (
              <article key={heading} className="min-w-0 rounded-xl border border-pp-line bg-white p-5">
                <h3 className="mb-3 text-lg font-semibold">{heading}</h3>
                <dl className="space-y-2">
                  {fields.map((value, index) => {
                    const label = category.columns[index + 1];
                    if (!value || value === "—") return null;
                    return <div key={label} className="grid gap-x-3 sm:grid-cols-[8rem_1fr]">
                      <dt className="text-sm font-medium text-pp-ink-3">{label}</dt>
                      <dd className="min-w-0 whitespace-pre-line break-words text-sm text-pp-ink [overflow-wrap:anywhere]"><ContactValue label={label} value={value} /></dd>
                    </div>;
                  })}
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
