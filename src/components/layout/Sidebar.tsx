"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const employeeNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/modules", label: "Modules", icon: "❏" },
  { href: "/search", label: "Search", icon: "⌕" },
];

// Full admin nav — SUPER_ADMIN only (includes module management)
const superAdminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "▣" },
  { href: "/admin/modules", label: "Manage Modules", icon: "❏" },
  { href: "/admin/employees", label: "Employees", icon: "◉" },
  { href: "/admin/org-chart", label: "Org Chart", icon: "⌬" },
  { href: "/admin/onboarding", label: "Onboarding", icon: "↗" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "≡" },
];

// Manager nav — no module management
const managerNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "▣" },
  { href: "/admin/employees", label: "Employees", icon: "◉" },
  { href: "/admin/org-chart", label: "Org Chart", icon: "⌬" },
  { href: "/admin/onboarding", label: "Onboarding", icon: "↗" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "≡" },
];

const sharedNav: NavItem[] = [
  { href: "/maintenance", label: "Maintenance", icon: "⚙" },
  { href: "/maintenance/inventory", label: "Inventory", icon: "▦" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
];

const marketingNav: NavItem[] = [
  { href: "/marketing", label: "Marketing", icon: "✦" },
  { href: "/marketing/voice", label: "Voice Profile", icon: "✎" },
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
  MARKETING: "Marketing",
  ADMIN: "Admin",
};

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isSuperAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isManager = role === "MANAGER";
  const isManagerOrAbove = isSuperAdmin || isManager;
  const hasMarketingAccess = role === "MARKETING" || isSuperAdmin;

  const nav = isSuperAdmin ? superAdminNav : isManager ? managerNav : employeeNav;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("portal-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

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
    if (href === "/dashboard" || href === "/admin") return pathname === href;
    if (pathname !== href && !pathname.startsWith(href + "/")) return false;
    // Longest-prefix wins: don't highlight /maintenance when on /maintenance/inventory.
    const candidates = [...nav, ...sharedNav, ...marketingNav]
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
        "relative flex items-center gap-3 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        isCollapsed ? "justify-center px-2" : "",
        active
          ? "bg-pp-surface text-pp-ink font-medium shadow-[inset_0_0_0_1px_var(--color-pp-line)]"
          : "text-pp-ink-2 hover:bg-black/[0.04]"
      );

    const activeRail = (active: boolean) =>
      active && !isCollapsed ? (
        <span className="absolute -left-[14px] top-1.5 bottom-1.5 w-[2px] rounded bg-pp-accent" />
      ) : null;

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
            <Image
              src="/planet-pooch-logo.png"
              alt="Planet Pooch"
              width={1250}
              height={392}
              priority
              className="h-auto w-[160px] flex-shrink-0"
            />
          ) : (
            <div className="h-[36px] w-[36px] overflow-hidden flex-shrink-0" title="Planet Pooch">
              <Image
                src="/planet-pooch-logo.png"
                alt="Planet Pooch"
                width={1898}
                height={901}
                priority
                className="h-full w-auto max-w-none"
              />
            </div>
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

        <nav className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto">
          {/* Primary nav */}
          <div className="flex flex-col gap-px">
            {nav.map((item) => {
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
          </div>

          {/* Tools */}
          {!isCollapsed ? (
            <div className="px-2.5 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-pp-ink-4">Tools</div>
          ) : (
            <div className="mx-1.5 h-px bg-pp-line" />
          )}
          <div className="-mt-2 flex flex-col gap-px">
            {sharedNav.map((item) => {
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
          </div>

          {/* Marketing section — visible to MARKETING role and SUPER_ADMIN */}
          {hasMarketingAccess && (
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
                        {item.icon}
                      </span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}

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
                  const active = pathname === item.href;
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
              </div>
            </>
          )}
        </nav>

        {/* User section */}
        <div className="mt-3 border-t border-pp-line pt-3">
          {!isCollapsed ? (
            <>
              <div className="px-2 py-1">
                <p className="truncate text-[13px] font-medium text-pp-ink">{session?.user?.name}</p>
                {role && (
                  <p className="truncate text-[11px] text-pp-ink-3">{ROLE_LABELS[role] ?? role}</p>
                )}
                <p className="truncate text-[11px] text-pp-ink-4">{session?.user?.email}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="mt-1 w-full rounded-md px-3 py-1.5 text-left text-[12px] text-pp-ink-3 transition-colors hover:bg-black/[0.04] hover:text-pp-ink"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div
                className="grid h-[30px] w-[30px] place-items-center rounded-md bg-pp-accent text-[11px] font-semibold tracking-wide text-white"
                title={session?.user?.name || ""}
              >
                {session?.user?.name?.charAt(0) || "?"}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Sign out"
                aria-label="Sign out"
                className="rounded-md p-1.5 text-pp-ink-4 transition-colors hover:bg-black/[0.04]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile top bar — only shows below md. Sits at the top of the page,
          above the main content. The rest of the layout adds top padding to
          compensate. */}
      <div className="md:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b border-pp-line bg-pp-bg-2 px-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-pp-ink-2 transition-colors hover:bg-black/[0.04]"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Image
          src="/planet-pooch-logo.png"
          alt="Planet Pooch"
          width={1250}
          height={392}
          priority
          className="h-6 w-auto"
        />
        <div className="w-8" />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 bottom-0 flex w-[260px] max-w-[85vw] flex-col bg-pp-bg-2 px-[14px] py-[18px] shadow-xl">
            {renderInner(false)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:sticky md:top-0 md:flex h-screen flex-col flex-shrink-0 transition-all duration-300 bg-pp-bg-2 border-r border-pp-line",
          collapsed ? "md:w-[60px] md:px-2 md:py-4" : "md:w-[232px] md:px-[14px] md:py-[18px]"
        )}
      >
        {renderInner(collapsed)}
      </aside>
    </>
  );
}
