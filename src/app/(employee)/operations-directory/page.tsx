import { requireAuth } from "@/lib/auth-helpers";

const sections = [
  {
    title: "Downtime lists",
    documents: [
      { title: "Staff Downtime List", url: "/operations-directory/staff-downtime-list" },
      { title: "Manager Downtime List", url: "/operations-directory/manager-downtime-list" },
    ],
  },
  {
    title: "Facility and vendor contacts",
    documents: [
      { title: "Facility Service Providers", url: "/operations-directory/facility-service-providers" },
      { title: "Supply Vendors", url: "/operations-directory/supply-vendors" },
      { title: "Utilities", url: "/operations-directory/utilities" },
    ],
  },
];

export default async function OperationsDirectoryPage() {
  await requireAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
      <h1 className="text-3xl font-semibold text-pp-ink">Operations Directory</h1>
      {sections.map(({ title, documents }) => (
        <section key={title}>
          <h2 className="mb-3 text-lg font-semibold">{title}</h2>
          <ul className="divide-y divide-pp-line rounded-xl border border-pp-line bg-white">
            {documents.map((document) => (
              <li key={document.url}>
                <a href={document.url} className="flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-pp-ink hover:bg-pp-surface-2 focus-visible:outline-2 focus-visible:outline-pp-accent">
                  {document.title}
                  <span className="text-xs text-pp-ink-3">PDF</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
