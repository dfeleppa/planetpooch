"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useBusiness } from "@/components/business/BusinessProvider";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { hasAskPoochAccess } from "@/lib/knowledge-access";
import { canEditGroomingCounts } from "@/lib/grooming-inventory-access";
import { UserMenu } from "./UserMenu";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const employeeNav: NavItem[] = [
  { href: "/dashboard", label: "Employee Dashboard", icon: "▣" },
];

// Full admin nav — SUPER_ADMIN only (includes module management)
const superAdminNav: NavItem[] = [
  { href: "/admin/employees", label: "People", icon: "" },
  { href: "/admin/module-progress", label: "Modules", icon: "❏" },
];

// Manager nav — no module management
const managerNav: NavItem[] = [
  { href: "/admin/employees", label: "People", icon: "" },
  { href: "/admin/module-progress", label: "Modules", icon: "❏" },
];

const sharedNav: NavItem[] = [
  { href: "/maintenance/checklists", label: "Daily Checklists", icon: "✓" },
  { href: "/operations/daycare", label: "Daycare", icon: "☀" },
  { href: "/maintenance/vans", label: "Vans", icon: "▣" },
  { href: "/maintenance", label: "Maintenance", icon: "⚙" },
];

const marketingNav: NavItem[] = [
  { href: "/marketing", label: "Marketing", icon: "" },
];

const financeNav: NavItem[] = [
  { href: "/finance", label: "Metrics", icon: "" },
  { href: "/finance/payroll", label: "Payroll", icon: "◷" },
  { href: "/cash-management", label: "Cash Management", icon: "$" },
];

const peoplePaths = [
  "/admin",
  "/admin/employees",
  "/admin/scheduling",
];

const modulePaths = [
  "/admin/modules",
  "/admin/module-progress",
  "/admin/audit-log",
];

function sidebarIcon(item: NavItem) {
  if (item.href === "/admin/org-chart") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="5" rx="1" />
        <path d="M12 8v4M5 16v-4h14v4" />
        <rect x="2" y="16" width="6" height="5" rx="1" />
        <rect x="16" y="16" width="6" height="5" rx="1" />
      </svg>
    );
  }
  if (item.href === "/admin/dashboard") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M10 9v12" />
      </svg>
    );
  }
  if (item.href === "/finance") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21h18M6 17v-5h3v5m3 0V7h3v10m3 0V3h3v14" />
      </svg>
    );
  }
  if (item.href === "/marketing") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 10h4l10-4v12L7 14H3v-4Z" />
        <path d="m7 14 1.5 5h3L10 15M20 9l2-1M20 15l2 1" />
      </svg>
    );
  }
  if (["/admin/modules", "/admin/module-progress"].includes(item.href)) {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5.5C9.5 4 6.5 4 3 4v14c3.5 0 6.5 0 9 1.5 2.5-1.5 5.5-1.5 9-1.5V4c-3.5 0-6.5 0-9 1.5Z" />
        <path d="M12 5.5v14" />
      </svg>
    );
  }
  if (item.href === "/dashboard") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20v-1a7 7 0 0 1 14 0v1H5Z" />
      </svg>
    );
  }
  return item.icon;
}

export function Sidebar() {
  const business = useBusiness();
  const operationsNav = sharedNav.filter((item) =>
    business.company === "RESORT"
      ? item.href !== "/maintenance/vans"
      : item.href === "/maintenance/vans" || item.href === "/maintenance"
  );
  const businessFinanceNav: NavItem[] = financeNav.map((item) =>
    item.href === "/finance/payroll" && business.company === "GROOMING"
      ? { ...item, href: "/finance/payroll/mobile-grooming" }
      : item
  );
  if (business.company === "GROOMING") {
    businessFinanceNav.push({
      href: "/cash-management/mobile-grooming/reconciliation",
      label: "Employee Verification",
      icon: "✓",
    });
  }
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const jobTitle = session?.user?.jobTitle;
  const isSuperAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const canAskPooch = hasAskPoochAccess(session?.user);
  const isKnowledgeAccount = canAskPooch && isKnowledgeOwner({ email: session?.user?.email, role });
  const isManager = role === "MANAGER";
  // "Manager-tier admin UI" — controls visibility of the Employee View
  // section.
  const isManagerOrAbove = isSuperAdmin || isManager;
  const corporateNav: NavItem[] = [
    ...(isSuperAdmin
      ? [
          { href: "/admin/dashboard", label: "Dashboard", icon: "" },
          ...marketingNav,
          ...(isKnowledgeAccount ? [{ href: "/admin/knowledge", label: "Knowledge library", icon: "✦" }] : []),
        ]
      : []),
    ...(isManagerOrAbove ? [{ href: "/admin/org-chart", label: "Org Chart", icon: "" }, ...businessFinanceNav] : []),
  ];
  const showGroomingInventory = !isManagerOrAbove && canEditGroomingCounts(session?.user);
  const hasMarketingAccess =
    role === "MARKETING" || isSuperAdmin || jobTitle === "CMO";
  // CMO can manage modules — give the same admin nav as SUPER_ADMIN so
  // "Manage Modules" appears alongside the rest of the admin links.
  const canManageModules = isSuperAdmin || jobTitle === "CMO";

  const baseNav = canManageModules
    ? superAdminNav
    : isManager
    ? managerNav
    : employeeNav;
  const nav = baseNav;
  // The admin navs (super admin / manager) are the HR links;
  // the plain employee nav is not.
  const isAdminNav = baseNav !== employeeNav;

  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window === "undefined" ||
      localStorage.getItem("portal-sidebar-collapsed") !== "false"
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer when the path changes (link click, back button, etc.)
  // without using an effect. Setting state during render is the React 19
  // pattern for resetting derived state on a prop change.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("portal-sidebar-collapsed", String(next));
  }

  function isActive(href: string) {
    if (href === "/admin/knowledge") return pathname === href || pathname.startsWith(href + "/");
    if (href === "/admin/employees") {
      return peoplePaths.some((path) =>
        path === "/admin" ? pathname === path : pathname === path || pathname.startsWith(path + "/")
      );
    }
    if (href === "/admin/modules" || href === "/admin/module-progress") {
      return modulePaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
    }
    if (href === "/dashboard") {
      return ["/dashboard", "/modules", "/career"].some(
        (path) => pathname === path || pathname.startsWith(path + "/")
      );
    }
    if (href === "/admin") return pathname === href;
    if (pathname !== href && !pathname.startsWith(href + "/")) return false;
    // Longest-prefix wins: don't highlight /maintenance when on /maintenance/inventory.
    const candidates = [...nav, ...corporateNav, ...operationsNav, ...marketingNav, ...businessFinanceNav]
      .map((n) => n.href)
      .filter((h) => h !== "/dashboard" && h !== "/admin")
      .filter((h) => pathname === h || pathname.startsWith(h + "/"));
    const longest = candidates.reduce((acc, h) => (h.length > acc.length ? h : acc), "");
    return longest === href;
  }

  // Renders the inner contents of the sidebar (brand, nav, user). Used by both
  // the desktop sticky aside and the mobile slide-in drawer. `isCollapsed`
  // controls icon-only mode (desktop only — drawer is always expanded).
  function renderInner(isCollapsed: boolean) {
    const navItemClass = (active: boolean) =>
      cn(
        "relative flex min-h-10 items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] transition-colors",
        isCollapsed ? "justify-center px-2" : "",
        active
          ? "bg-pp-mint text-pp-ink font-semibold"
          : "text-white/80 hover:bg-white/10 hover:text-white"
      );

    const activeRail = (active: boolean) =>
      active && !isCollapsed ? <span className="absolute -left-[14px] top-2 bottom-2 w-[3px] rounded bg-pp-mint" /> : null;

    return (
      <>
        {/* Brand */}
        <div
          className={cn(
            "flex items-center border-b border-pp-line pb-3",
            isCollapsed ? "justify-center" : "justify-between gap-2 px-1"
          )}
        >
          {!isCollapsed ? (
            <Link href="/" aria-label="Go to home page">
              <Image
                src="/planet-pooch-logo.png"
                alt="Planet Pooch"
                width={1250}
                height={392}
                priority
                className="h-auto w-[160px] flex-shrink-0"
              />
            </Link>
          ) : (
            <Link href="/" aria-label="Go to home page" className="h-[36px] w-[36px] overflow-hidden flex-shrink-0" title="Planet Pooch">
              <Image
                src="/planet-pooch-logo.png"
                alt="Planet Pooch"
                width={1898}
                height={901}
                priority
                className="h-full w-auto max-w-none"
              />
            </Link>
          )}
          {!isCollapsed && (
            <button
              onClick={() => {
                if (mobileOpen) setMobileOpen(false);
                else toggleCollapsed();
              }}
              className="rounded-md p-1.5 text-pp-ink-4 transition-colors hover:bg-black/[0.04] hover:text-pp-ink-2"
              title={mobileOpen ? "Close menu" : "Collapse sidebar"}
              aria-label={mobileOpen ? "Close menu" : "Collapse sidebar"}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                )}
              </svg>
            </button>
          )}
        </div>

        {isCollapsed && (
          <button
            onClick={toggleCollapsed}
            className="mt-3 self-center rounded-md p-1.5 text-pp-ink-4 transition-colors hover:bg-black/[0.04] hover:text-pp-ink-2"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <svg className="h-4 w-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}

        <nav className="pp-sidebar-nav mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
          {/* Corporate navigation preserves each page's existing role access. */}
          {corporateNav.length > 0 && (
            <>
              {!isCollapsed ? (
                <div className="px-2.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">
                  Corporate
                </div>
              ) : (
                <div className="mx-1.5 h-px bg-pp-line" />
              )}
              <div className="-mt-2 flex flex-col gap-px">
                {corporateNav.map((item) => {
                  const active = item.href === "/admin/dashboard"
                    ? pathname === item.href
                    : isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} title={isCollapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={navItemClass(active)}>
                      {activeRail(active)}
                      <span className={cn("text-[14px] w-4 text-center flex-shrink-0", active ? "text-pp-accent" : "text-pp-ink-3")} aria-hidden="true">
                        {sidebarIcon(item)}
                      </span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          {/* Marketing section — visible to MARKETING role and SUPER_ADMIN */}
          {hasMarketingAccess && !isSuperAdmin && (
            <>
              {!isCollapsed ? (
                <div className="px-2.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">
                  Marketing
                </div>
              ) : (
                <div className="mx-1.5 h-px bg-pp-line" />
              )}
              <div className="-mt-2 flex flex-col gap-px">
                {marketingNav.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} title={isCollapsed ? item.label : undefined} className={navItemClass(active)}>
                      {activeRail(active)}
                      <span className={cn("text-[14px] w-4 text-center flex-shrink-0", active ? "text-pp-accent" : "text-pp-ink-3")}>
                        {sidebarIcon(item)}
                      </span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          {/* Operations */}
          {!isCollapsed ? (
            <div className="px-2.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">Operations</div>
          ) : (
            <div className="mx-1.5 h-px bg-pp-line" />
          )}
          <div className="-mt-2 flex flex-col gap-px">
            {operationsNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} title={isCollapsed ? item.label : undefined} className={navItemClass(active)}>
                  {activeRail(active)}
                  <span className={cn("text-[14px] w-4 text-center flex-shrink-0", active ? "text-pp-accent" : "text-pp-ink-3")}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
            {showGroomingInventory && (
              <Link href="/maintenance/inventory?company=GROOMING" title={isCollapsed ? "Inventory" : undefined} className={navItemClass(pathname === "/maintenance/inventory")}>
                {activeRail(pathname === "/maintenance/inventory")}
                <span className="text-[14px] w-4 text-center flex-shrink-0" aria-hidden="true">▤</span>
                {!isCollapsed && <span className="truncate">Inventory</span>}
              </Link>
            )}
          </div>

          {/* Human Resources — admin navs only (plain employee nav has no header) */}
          {isAdminNav && !isCollapsed && (
            <div className="px-2.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">
              Human Resources
            </div>
          )}
          <div className={cn("flex flex-col gap-px", isAdminNav && !isCollapsed && "-mt-2")}>
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} title={isCollapsed ? item.label : undefined} className={navItemClass(active)}>
                  {activeRail(active)}
                  <span className={cn("text-[14px] w-4 text-center flex-shrink-0", active ? "text-pp-accent" : "text-pp-ink-3")}>
                    {item.href === "/admin/employees" ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3 19v-1a6 6 0 0 1 12 0v1H3Z" />
                        <path d="M17 11a3 3 0 1 0-1.2-5.75M17 14a5 5 0 0 1 4 5h-3" />
                      </svg>
                    ) : sidebarIcon(item)}
                  </span>
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {/* Manager/Admin: Employee View section */}
          {isManagerOrAbove && (
            <>
              {!isCollapsed ? (
                <div className="px-2.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">
                  Employee View
                </div>
              ) : (
                <div className="mx-1.5 h-px bg-pp-line" />
              )}
              <div className="-mt-2 flex flex-col gap-px">
                {employeeNav.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} title={isCollapsed ? item.label : undefined} className={navItemClass(active)}>
                      {activeRail(active)}
                      <span className={cn("text-[14px] w-4 text-center flex-shrink-0", active ? "text-pp-accent" : "text-pp-ink-3")}>
                        {sidebarIcon(item)}
                      </span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {canAskPooch && <Link href="/knowledge" title={isCollapsed ? "Ask Pooch" : undefined} aria-current={isActive("/knowledge") ? "page" : undefined} className={cn(navItemClass(isActive("/knowledge")), "mt-1 border-t border-pp-line pt-3")}>
            {activeRail(isActive("/knowledge"))}
            <span className={cn("text-[14px] w-4 text-center flex-shrink-0", isActive("/knowledge") ? "text-pp-accent" : "text-pp-ink-3")} aria-hidden="true">✦</span>
            {!isCollapsed && <span className="truncate">Ask Pooch</span>}
          </Link>}

        </nav>

      </>
    );
  }

  return (
    <>
      {/* Mobile top bar — only shows below md. Sits at the top of the page,
          above the main content. The rest of the layout adds top padding to
          compensate. */}
      <div className="pp-mobile-bar md:hidden sticky top-0 z-30 flex h-14 items-center justify-between px-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-pp-ink-2 transition-colors hover:bg-black/[0.04]"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" aria-label="Go to home page">
          <Image
            src="/planet-pooch-logo.png"
            alt="Planet Pooch"
            width={1250}
            height={392}
            priority
            className="h-6 w-auto"
          />
        </Link>
        <UserMenu compact />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="pp-sidebar absolute left-0 top-0 bottom-0 flex w-[260px] max-w-[85vw] flex-col px-[14px] py-[18px] shadow-xl">
            {renderInner(false)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "pp-sidebar hidden md:sticky md:top-0 md:flex h-screen flex-col flex-shrink-0 transition-all duration-300",
          collapsed ? "md:w-[76px] md:px-3 md:py-5" : "md:w-[240px] md:px-[14px] md:py-[18px]"
        )}
      >
        {renderInner(collapsed)}
      </aside>
    </>
  );
}
