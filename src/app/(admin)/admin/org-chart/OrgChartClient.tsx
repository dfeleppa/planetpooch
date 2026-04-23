"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Role = "SUPER_ADMIN" | "MANAGER" | "EMPLOYEE" | "ADMIN";
type Company = "MOBILE" | "RESORT";

interface UserNode {
  id: string;
  name: string;
  role: Role;
  company: Company | null;
  jobTitle: string | null;
  managerId: string | null;
}

interface Props {
  initialUsers: UserNode[];
  canViewBothCompanies: boolean;
  lockedCompany: Company | null;
}

type CompanyView = "BOTH" | "MOBILE" | "RESORT";

const COMPANY_LABELS: Record<Company, string> = {
  MOBILE: "Planet Pooch Mobile Inc",
  RESORT: "Planet Pooch Pet Resort Inc",
};

const ROLE_STYLES: Record<Role, { bg: string; text: string; label: string }> = {
  SUPER_ADMIN: { bg: "bg-purple-50 border-purple-300", text: "text-purple-700", label: "Super Admin" },
  ADMIN: { bg: "bg-purple-50 border-purple-300", text: "text-purple-700", label: "Super Admin" },
  MANAGER: { bg: "bg-blue-50 border-blue-300", text: "text-blue-700", label: "Manager" },
  EMPLOYEE: { bg: "bg-gray-50 border-gray-300", text: "text-gray-700", label: "Employee" },
};

/** Build a tree rooted at users with no manager (or manager outside the given subset). */
function buildTree(users: UserNode[]): UserNode[] {
  const ids = new Set(users.map((u) => u.id));
  // Root = no manager OR manager not in the visible subset
  return users.filter((u) => !u.managerId || !ids.has(u.managerId));
}

function getChildren(users: UserNode[], parentId: string): UserNode[] {
  return users.filter((u) => u.managerId === parentId);
}

export function OrgChartClient({ initialUsers, canViewBothCompanies, lockedCompany }: Props) {
  const [users, setUsers] = useState<UserNode[]>(initialUsers);
  const [view, setView] = useState<CompanyView>(
    canViewBothCompanies ? "BOTH" : (lockedCompany as CompanyView) ?? "BOTH"
  );
  const [showNames, setShowNames] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState<Company | "CROSS" | null>(null);

  // SUPER_ADMIN ("cross-company") users — shown regardless of company filter
  const crossCompanyUsers = useMemo(
    () => users.filter((u) => u.company === null && (u.role === "SUPER_ADMIN" || u.role === "ADMIN")),
    [users]
  );

  const mobileUsers = useMemo(() => users.filter((u) => u.company === "MOBILE"), [users]);
  const resortUsers = useMemo(() => users.filter((u) => u.company === "RESORT"), [users]);

  const showMobile = view === "BOTH" || view === "MOBILE";
  const showResort = view === "BOTH" || view === "RESORT";
  const showCross = view === "BOTH";

  async function updateManager(userId: string, managerId: string | null) {
    setSaving(true);
    setError("");
    const prev = users;
    // Optimistic update
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, managerId } : u)));
    try {
      const res = await fetch("/api/org-chart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, managerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      // Roll back
      setUsers(prev);
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(e: React.DragEvent, userId: string) {
    setDraggingId(userId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", userId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverRoot(null);
  }

  function handleDropOnUser(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData("text/plain");
    setDragOverId(null);
    setDragOverRoot(null);
    if (sourceId && sourceId !== targetId) {
      updateManager(sourceId, targetId);
    }
  }

  function handleDropOnRoot(e: React.DragEvent) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    setDragOverId(null);
    setDragOverRoot(null);
    if (sourceId) {
      updateManager(sourceId, null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            {canViewBothCompanies && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">View:</span>
                <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
                  {(["BOTH", "MOBILE", "RESORT"] as CompanyView[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        view === v ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {v === "BOTH" ? "Both" : v === "MOBILE" ? "Mobile" : "Resort"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Names:</span>
              <button
                type="button"
                onClick={() => setShowNames((s) => !s)}
                className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                  showNames
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {showNames ? "Shown" : "Hidden (positions only)"}
              </button>
            </div>

            {saving && <span className="text-sm text-gray-500">Saving…</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Cross-company (CEO, Director of Strategy) */}
      {showCross && crossCompanyUsers.length > 0 && (
        <CompanySection
          title="Leadership (Cross-Company)"
          subtitle="CEO, Director of Strategy"
          users={crossCompanyUsers}
          showNames={showNames}
          draggingId={draggingId}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
          dragOverRoot={dragOverRoot === "CROSS"}
          setDragOverRoot={(b) => setDragOverRoot(b ? "CROSS" : null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnUser={handleDropOnUser}
          onDropOnRoot={handleDropOnRoot}
        />
      )}

      {showMobile && (
        <CompanySection
          title={COMPANY_LABELS.MOBILE}
          subtitle="Mobile grooming division"
          users={mobileUsers}
          showNames={showNames}
          draggingId={draggingId}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
          dragOverRoot={dragOverRoot === "MOBILE"}
          setDragOverRoot={(b) => setDragOverRoot(b ? "MOBILE" : null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnUser={handleDropOnUser}
          onDropOnRoot={handleDropOnRoot}
        />
      )}

      {showResort && (
        <CompanySection
          title={COMPANY_LABELS.RESORT}
          subtitle="Pet resort division"
          users={resortUsers}
          showNames={showNames}
          draggingId={draggingId}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
          dragOverRoot={dragOverRoot === "RESORT"}
          setDragOverRoot={(b) => setDragOverRoot(b ? "RESORT" : null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnUser={handleDropOnUser}
          onDropOnRoot={handleDropOnRoot}
        />
      )}

      <p className="text-xs text-gray-400 text-center">
        Drag an employee card onto a manager card to update who they report to. Drop on the section header to remove their manager.
      </p>
    </div>
  );
}

/** A single company (or cross-company) org tree block. */
function CompanySection({
  title,
  subtitle,
  users,
  showNames,
  draggingId,
  dragOverId,
  setDragOverId,
  dragOverRoot,
  setDragOverRoot,
  onDragStart,
  onDragEnd,
  onDropOnUser,
  onDropOnRoot,
}: {
  title: string;
  subtitle: string;
  users: UserNode[];
  showNames: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  dragOverRoot: boolean;
  setDragOverRoot: (b: boolean) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDropOnUser: (e: React.DragEvent, id: string) => void;
  onDropOnRoot: (e: React.DragEvent) => void;
}) {
  const roots = buildTree(users);

  return (
    <Card>
      <CardContent className="py-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverRoot(true);
          }}
          onDragLeave={() => setDragOverRoot(false)}
          onDrop={onDropOnRoot}
          className={`mb-4 pb-3 border-b transition-colors ${
            dragOverRoot ? "bg-blue-50 border-blue-300" : "border-gray-200"
          }`}
        >
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
          {dragOverRoot && (
            <p className="text-xs text-blue-600 mt-1">Drop here to remove manager (make top-level)</p>
          )}
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No employees yet.</p>
        ) : (
          <div className="space-y-2">
            {roots.map((root) => (
              <TreeNode
                key={root.id}
                node={root}
                allUsers={users}
                depth={0}
                showNames={showNames}
                draggingId={draggingId}
                dragOverId={dragOverId}
                setDragOverId={setDragOverId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropOnUser={onDropOnUser}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TreeNode({
  node,
  allUsers,
  depth,
  showNames,
  draggingId,
  dragOverId,
  setDragOverId,
  onDragStart,
  onDragEnd,
  onDropOnUser,
}: {
  node: UserNode;
  allUsers: UserNode[];
  depth: number;
  showNames: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDropOnUser: (e: React.DragEvent, id: string) => void;
}) {
  const children = getChildren(allUsers, node.id);
  const styles = ROLE_STYLES[node.role];
  const isDragging = draggingId === node.id;
  const isDragOver = dragOverId === node.id;

  return (
    <div className="relative">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, node.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (draggingId && draggingId !== node.id) setDragOverId(node.id);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          setDragOverId(null);
        }}
        onDrop={(e) => onDropOnUser(e, node.id)}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-move transition-all ${
          styles.bg
        } ${isDragging ? "opacity-40" : ""} ${
          isDragOver ? "ring-2 ring-blue-500 ring-offset-1" : ""
        }`}
        style={{ marginLeft: depth * 24 }}
      >
        <span className="text-gray-400 text-xs select-none">⋮⋮</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${styles.text}`}>
              {node.jobTitle || styles.label}
            </span>
            <span className="text-xs bg-white/60 border border-current/10 px-1.5 py-0.5 rounded text-gray-500">
              {styles.label}
            </span>
          </div>
          {showNames && (
            <p className="text-sm text-gray-700 mt-0.5 truncate">{node.name}</p>
          )}
          {!showNames && <p className="text-xs text-gray-400 italic mt-0.5">—</p>}
        </div>
        {children.length > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {children.length} {children.length === 1 ? "report" : "reports"}
          </span>
        )}
      </div>

      {children.length > 0 && (
        <div className="mt-1 space-y-1 border-l-2 border-gray-200 ml-4">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              allUsers={allUsers}
              depth={depth + 1}
              showNames={showNames}
              draggingId={draggingId}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOnUser={onDropOnUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}
