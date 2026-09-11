import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminDashboardData } from "@/lib/admin-dashboard";
import { formatWeekRange, toWeekParam } from "@/lib/week";
import { DailyPriorityChecklist } from "./DailyPriorityChecklist";

const money = (cents: number | null | undefined) => cents == null ? "—" :
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
const dateLabel = (date: Date, timeZone = "UTC") => date.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });
const panelClass = "rounded-xl border border-pp-line bg-pp-surface";
const linkClass = "text-xs font-medium text-pp-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pp-accent";

function Stat({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return (
    <Link href={href} className={`${panelClass} flex min-w-0 flex-col p-5 transition-colors hover:border-pp-accent-line focus-visible:outline-2 focus-visible:outline-pp-accent`}>
      <span className="text-xs font-medium text-pp-ink-3">{label}</span>
      <span className="mt-3 text-3xl font-semibold tracking-tight text-pp-ink tabular-nums">{value}</span>
      <span className="mt-2 text-xs leading-5 text-pp-ink-3">{detail}</span>
    </Link>
  );
}

function PanelHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-pp-line px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-pp-ink">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-pp-ink-3">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Attention({ title, detail, count, href }: { title: string; detail: string; count: number | null; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-pp-surface-2">
      <span className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums ${count != null && count > 0 ? "bg-pp-warn-bg text-pp-warn" : "bg-pp-bg-2 text-pp-ink-3"}`}>{number(count)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-pp-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-pp-ink-3">{count === null ? "Currently unavailable" : detail}</span>
      </span>
      <span aria-hidden="true" className="text-pp-ink-4">↗</span>
    </Link>
  );
}

export function DashboardView({ data }: { data: AdminDashboardData }) {
  const { business, periods, sales, payroll, operations, team, checklists } = data;
  const resort = business.company === "RESORT";
  const current = sales?.weeks[5];
  const previous = sales?.weeks[4];
  const change = current?.netSalesCents != null && previous?.netSalesCents != null && previous.netSalesCents !== 0
    ? (current.netSalesCents - previous.netSalesCents) / Math.abs(previous.netSalesCents) * 100 : null;
  const payrollPercent = payroll?.totalCents != null && current?.netSalesCents != null && current.netSalesCents > 0
    ? payroll.totalCents / current.netSalesCents * 100 : null;
  const maxSales = Math.max(1, ...(sales?.weeks.map((week) => Math.abs(week.netSalesCents ?? 0)) ?? []));
  const kpiHref = `/finance/kpis?segment=${resort ? "PET_RESORT" : "MOBILE_GROOMING"}&week=${toWeekParam(periods.weekStart)}`;
  const payrollHref = resort ? "/finance/payroll" : "/finance/payroll/mobile-grooming";
  const shortcuts = [
    { href: kpiHref, title: "Weekly KPIs", detail: "Actuals, targets, and forecasts" },
    { href: "/finance/profit-loss", title: "Profit & Loss", detail: "Revenue, expenses, and margins" },
    { href: payrollHref, title: "Payroll", detail: resort ? "Pay runs and check dates" : "Weekly grooming reports" },
    { href: "/admin/scheduling", title: "Scheduling", detail: "Team availability and coverage" },
    { href: resort ? "/operations/daycare" : "/maintenance", title: resort ? "Daycare follow-ups" : "Fleet maintenance", detail: resort ? "Packages and inactive clients" : "Tasks, schedules, and inventory" },
    { href: "/marketing/ad-reporting", title: "Ad reporting", detail: "Campaign spend and results" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-pp-accent">{business.label} · Business overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-pp-ink">Dashboard</h1>
          <p className="mt-2 text-sm text-pp-ink-3">Business performance, daily priorities, and the people behind them.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-pp-ink-3">{dateLabel(periods.today)}</span>
          <form action="/admin/dashboard" method="get">
            <button type="submit" className="rounded-lg border border-pp-line bg-pp-surface px-3 py-2 text-xs font-medium text-pp-ink-2 hover:bg-pp-surface-2">Refresh</button>
          </form>
        </div>
      </header>

      {resort && <DailyPriorityChecklist dateKey={periods.today.toISOString().slice(0, 10)} />}

      {data.unavailable.length > 0 && (
        <div role="status" className="rounded-lg border border-pp-warn-line bg-pp-warn-bg px-4 py-3 text-sm text-pp-warn">
          Unable to load: {data.unavailable.join(", ")}. Refresh to try again. Other available sections are shown below.
        </div>
      )}

      <section aria-labelledby="performance-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="performance-heading" className="text-sm font-semibold text-pp-ink">Last completed week</h2>
            <p className="mt-1 text-xs text-pp-ink-3">{formatWeekRange(periods.weekStart)} · Sunday–Saturday sales reporting</p>
          </div>
          <Link href={kpiHref} className={linkClass}>Open KPI report ↗</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Net sales" value={money(current?.netSalesCents)} href={kpiHref}
            detail={!sales ? "Sales unavailable" : current?.netSalesCents == null ? "No synced orders for this week" : change === null ? "Subtotal less discounts; excludes tax and tips" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs. the previous week`} />
          <Stat label="Orders" value={number(current?.orderCount)} href={kpiHref}
            detail="Completed and processing orders in the sales week" />
          <Stat label={resort ? "Payroll" : "Recorded staff hours"} value={resort ? money(payroll?.totalCents) : payroll?.totalHours == null ? "—" : `${number(payroll.totalHours)} hrs`} href={payrollHref}
            detail={!payroll ? "Payroll unavailable" : resort
              ? payroll?.totalCents == null ? `No pay runs recorded · Check date ${dateLabel(periods.payrollCheckDate)}` : `${payrollPercent == null ? "Payroll share unavailable" : `${payrollPercent.toFixed(1)}% of net sales`} · Check date ${dateLabel(periods.payrollCheckDate)}`
              : `${formatWeekRange(periods.payrollWeekStart)} · Saturday–Friday payroll${payroll?.status === "needs_review" ? " · Needs review" : ""}`} />
          <Stat label="Active team today" value={number(team?.activeCount)} href="/admin/employees"
            detail={team ? `${team.companyCount} ${business.label} + ${team.corporateCount} corporate team members` : "Team count unavailable"} />
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <section className={panelClass}>
          <PanelHeading title="Sales trend" subtitle="Six completed weeks · Net sales from synced MoeGo orders" />
          <div className="space-y-4 p-5">
            {sales ? sales.weeks.map((week, index) => (
              <div key={toWeekParam(week.weekStart)} className="grid grid-cols-[3.5rem_minmax(0,1fr)_6rem] items-center gap-3 text-xs">
                <span className="text-pp-ink-3">{week.weekStart.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}</span>
                <div className="h-7 overflow-hidden rounded bg-pp-bg-2" aria-hidden="true">
                  {week.netSalesCents !== null && <div className={`h-full rounded ${week.netSalesCents < 0 ? "bg-pp-warn" : index === 5 ? "bg-pp-accent" : "bg-pp-accent-line"}`} style={{ width: `${Math.abs(week.netSalesCents) / maxSales * 100}%` }} />}
                </div>
                <span className="text-right font-medium text-pp-ink tabular-nums">{week.netSalesCents === null ? "No records" : money(week.netSalesCents)}</span>
              </div>
            )) : <p className="text-sm text-pp-ink-3">Sales are currently unavailable.</p>}
            <p className="border-t border-pp-line pt-3 text-[11px] leading-5 text-pp-ink-3">
              {sales?.syncedAt ? `MoeGo order sync: ${sales.syncedAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}.` : "No MoeGo order sync timestamp available."} Figures reflect saved data; Refresh reloads this overview.
            </p>
          </div>
        </section>

        <section className={panelClass}>
          <PanelHeading title="Needs attention" subtitle="Current open items for this business" />
          <div className="p-2">
            <Attention title="Overdue maintenance" detail="Open tasks past their due date" count={operations?.overdueCount ?? null} href="/maintenance" />
            <Attention title="Low inventory" detail="Items at or below their minimum threshold" count={operations?.lowInventoryCount ?? null} href="/maintenance/inventory" />
            <Attention title={resort ? "Payroll entry to record" : "Payroll weeks to review"}
              detail={resort ? `${payroll?.totalCents == null ? "No pay run recorded" : "Pay run recorded"} · Check date ${dateLabel(periods.payrollCheckDate)}` : "Imports flagged for review before use"}
              count={payroll ? resort ? payroll.totalCents === null ? 1 : 0 : payroll.reviewCount : null} href={payrollHref} />
          </div>
        </section>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className={panelClass}>
          <PanelHeading title={resort ? "Today’s checklists" : "Team snapshot"}
            subtitle={resort ? `${dateLabel(periods.today)} · Eastern time` : "Active employees in the selected business and corporate team"}
            action={<Link href={resort ? "/maintenance/checklists" : "/admin/employees"} className={linkClass}>{resort ? "Open checklists" : "View team"} ↗</Link>} />
          <div className="space-y-4 p-5">
            {resort ? checklists ? checklists.map((checklist) => (
              <div key={checklist.period}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-pp-ink">{checklist.period === "AM" ? "Morning" : "Evening"}</span>
                  <span className="text-xs text-pp-ink-3">{checklist.total === 0 ? "No items configured" : `${checklist.completed} of ${checklist.total} complete`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-pp-bg-2" role="progressbar" aria-label={`${checklist.period} checklist completion`} aria-valuemin={0} aria-valuemax={checklist.total || 1} aria-valuenow={checklist.completed}>
                  <div className="h-full rounded-full bg-pp-accent" style={{ width: `${checklist.total ? checklist.completed / checklist.total * 100 : 0}%` }} />
                </div>
              </div>
            )) : <p className="text-sm text-pp-ink-3">Daily checklists are currently unavailable.</p>
              : <div className="flex items-center justify-between gap-4"><p className="text-sm text-pp-ink-2">Accounts awaiting first sign-in</p><span className="text-2xl font-semibold text-pp-ink tabular-nums">{number(team?.neverLoggedInCount)}</span></div>}
            <Link href="/admin/scheduling" className={`${linkClass} inline-block`}>Review team availability and scheduling ↗</Link>
          </div>
        </section>

        <section className={panelClass}>
          <PanelHeading title="Maintenance follow-up" subtitle={operations ? `${operations.upcomingCount} open tasks due in the next 7 days` : "Maintenance is currently unavailable"}
            action={<Link href="/maintenance" className={linkClass}>View all ↗</Link>} />
          <div className="p-5">
            {!operations ? <p className="text-sm text-pp-ink-3">Unable to load maintenance tasks.</p> : operations.overdueCount === 0
              ? <p className="rounded-lg bg-pp-ok-bg px-4 py-4 text-sm text-pp-ok">No overdue maintenance tasks.</p>
              : <ul className="divide-y divide-pp-line">
                  {operations.overdueTasks.map((task) => (
                    <li key={task.id}>
                      <Link href={`/maintenance/tasks/${task.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 hover:text-pp-accent">
                        <span className="min-w-0"><span className="block break-words text-sm font-medium">{task.title}</span><span className="mt-1 block text-xs text-pp-ink-3">{task.assignedTo?.name ?? "Unassigned"}</span></span>
                        <span className="shrink-0 text-xs text-pp-warn">{dateLabel(task.dueDate, "America/New_York")}</span>
                      </Link>
                    </li>
                  ))}
                  {operations.overdueCount > operations.overdueTasks.length && <li className="pt-3 text-xs text-pp-ink-3">Showing the 5 oldest of {operations.overdueCount} overdue tasks.</li>}
                </ul>}
          </div>
        </section>
      </div>

      <section aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" className="mb-3 text-sm font-semibold text-pp-ink">Go deeper</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href} className={`${panelClass} group flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:border-pp-accent-line`}>
              <span><span className="block text-sm font-medium text-pp-ink group-hover:text-pp-accent">{shortcut.title}</span><span className="mt-1 block text-xs text-pp-ink-3">{shortcut.detail}</span></span>
              <span aria-hidden="true" className="text-pp-ink-4">↗</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
