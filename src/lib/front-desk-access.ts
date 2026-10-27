/** Shared-device accounts are separate from employees and manager privileges. */
export const FRONT_DESK_HOME = "/maintenance/checklists?company=RESORT";

export function isFrontDesk(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === "FRONT_DESK";
}

export function frontDeskCompanyWhere(user: { role?: string | null }) {
  return isFrontDesk(user) ? { company: "RESORT" as const } : {};
}

/** Deny by default, including future routes. Configuration remains manager-only. */
export function frontDeskRouteAllowed(path: string, method = "GET"): boolean {
  if (path.startsWith("/api/auth/")) return true;
  const read = method === "GET" || method === "HEAD";
  if (path.startsWith("/api/")) {
    if (read && /^\/api\/maintenance\/(checklists(?:\/summary)?|inventory(?:\/[^/]+)?|inventory-categories|schedules(?:\/[^/]+)?|tasks(?:\/[^/]+)?)$/.test(path)) return true;
    if (method === "POST" && path === "/api/maintenance/checklists/completions") return true;
    if (method === "POST" && /^\/api\/maintenance\/tasks\/[^/]+\/complete$/.test(path)) return true;
    return method === "POST" && /^\/api\/operations\/daycare\/(package-credits|expired-packages|not-active)$/.test(path);
  }
  return read && (
    /^\/operations\/daycare(?:\/(packages|expired-packages|not-active))?$/.test(path) ||
    /^\/maintenance(?:\/(checklists|inventory|schedules|tasks)(?:\/[^/]+)?)?$/.test(path) &&
      !path.endsWith("/new")
  );
}
