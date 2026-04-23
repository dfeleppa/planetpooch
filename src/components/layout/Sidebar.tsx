"use client";

import Link from "next/link";
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
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/modules", label: "Modules", icon: "📚" },
  { href: "/search", label: "Search", icon: "🔍" },
];

// Full admin nav — SUPER_ADMIN only (includes module management)
const superAdminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/modules", label: "Manage Modules", icon: "📚" },
  { href: "/admin/employees", label: "Employees", icon: "👥" },
  { href: "/admin/org-chart", label: "Org Chart", icon: "🗂️" },
  { href: "/admin/onboarding", label: "Onboarding", icon: "🎯" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "📋" },
];

// Manager nav — no module management
const managerNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/employees", label: "Employees", icon: "👥" },
  { href: "/admin/org-chart", label: "Org Chart", icon: "🗂️" },
  { href: "/admin/onboarding", label: "Onboarding", icon: "🎯" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "📋" },
];

const sharedNav: NavItem[] = [
  { href: "/maintenance", label: "Maintenance", icon: "🔧" },
  { href: "/maintenance/inventory", label: "Inventory", icon: "📦" },
  { href: "/tasks", label: "Tasks", icon: "✅" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isSuperAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isManager = role === "MANAGER";
  const isManagerOrAbove = isSuperAdmin || isManager;

  const nav = isSuperAdmin ? superAdminNav : isManager ? managerNav : employeeNav;

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("portal-sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("portal-sidebar-collapsed", String(next));
  }

  function isActive(href: string) {
    if (href === "/dashboard" || href === "/admin") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={cn(
        "bg-white border-r border-gray-200 flex flex-col min-h-screen transition-all duration-300 flex-shrink-0",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn("p-4 border-b border-gray-100 flex items-center", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <div>
            <h1 className="text-xl font-bold text-gray-900">Portal</h1>
            <p className="text-xs text-gray-500 mt-1">Company Portal</p>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={cn("w-4 h-4 transition-transform duration-300", collapsed ? "rotate-180" : "")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              collapsed ? "justify-center" : "",
              isActive(item.href)
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <span className="text-base flex-shrink-0">{item.icon}</span>
            {!collapsed && item.label}
          </Link>
        ))}

        {/* Tools section */}
        {!collapsed && (
          <div className="pt-4 pb-1">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tools</p>
          </div>
        )}
        {collapsed && <div className="pt-2 pb-1 border-t border-gray-100 mx-2" />}
        {sharedNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              collapsed ? "justify-center" : "",
              isActive(item.href)
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <span className="text-base flex-shrink-0">{item.icon}</span>
            {!collapsed && item.label}
          </Link>
        ))}

        {/* Manager/Admin: Employee View section */}
        {isManagerOrAbove && (
          <>
            {!collapsed && (
              <div className="pt-4 pb-1">
                <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Employee View</p>
              </div>
            )}
            {collapsed && <div className="pt-2 pb-1 border-t border-gray-100 mx-2" />}
            {employeeNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  collapsed ? "justify-center" : "",
                  pathname === item.href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-gray-100">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700 flex-shrink-0">
                {session?.user?.name?.charAt(0) || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{session?.user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-1 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg text-left transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700 cursor-pointer"
              title={session?.user?.name || ""}
            >
              {session?.user?.name?.charAt(0) || "?"}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
