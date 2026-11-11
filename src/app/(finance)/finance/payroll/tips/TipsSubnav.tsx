import Link from "next/link";

export function TipsSubnav({ active }: { active: "pool" | "groomers" }) {
  return <nav className="pp-tabs" aria-label="Tips sections">
    <Link href="/finance/payroll/tips" className={active === "pool" ? "pp-tab is-on" : "pp-tab"}
      aria-current={active === "pool" ? "page" : undefined}>Tip pool</Link>
    <Link href="/finance/payroll/tips/groomers" className={active === "groomers" ? "pp-tab is-on" : "pp-tab"}
      aria-current={active === "groomers" ? "page" : undefined}>Groomers</Link>
  </nav>;
}
