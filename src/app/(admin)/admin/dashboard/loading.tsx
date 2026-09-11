export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" role="status" aria-label="Loading dashboard">
      <h1 className="text-3xl font-semibold text-pp-ink">Dashboard</h1>
      <p className="text-sm text-pp-ink-3">Loading business performance and daily priorities…</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl border border-pp-line bg-pp-bg-2 motion-reduce:animate-none" />)}
      </div>
    </div>
  );
}
