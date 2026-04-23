"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RoleVal = "SUPER_ADMIN" | "MANAGER" | "EMPLOYEE" | "ADMIN";
type CompanyVal = "MOBILE" | "RESORT";

interface Position {
  id: string;
  title: string;
  company: CompanyVal | null;
  parentPositionId: string | null;
  assignedUserId: string | null;
  order: number;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: RoleVal;
  company: CompanyVal | null;
  jobTitle: string | null;
}

interface Props {
  initialPositions: Position[];
  initialUsers: UserOption[];
  canViewBothCompanies: boolean;
  lockedCompany: CompanyVal | null;
  isSuperAdmin: boolean;
}

type CompanyView = "BOTH" | "MOBILE" | "RESORT";

const COMPANY_LABELS: Record<CompanyVal, string> = {
  MOBILE: "Planet Pooch Mobile Inc",
  RESORT: "Planet Pooch Pet Resort Inc",
};

export function OrgChartClient({
  initialPositions,
  initialUsers,
  canViewBothCompanies,
  lockedCompany,
  isSuperAdmin,
}: Props) {
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  const [users] = useState<UserOption[]>(initialUsers);
  const [view, setView] = useState<CompanyView>(
    canViewBothCompanies ? "BOTH" : (lockedCompany as CompanyView) ?? "BOTH"
  );
  const [showNames, setShowNames] = useState(true);
  const [layout, setLayout] = useState<"LIST" | "CHART">("CHART");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState<CompanyVal | "CROSS" | null>(null);
  const [assignModalFor, setAssignModalFor] = useState<Position | null>(null);
  const [createModalCompany, setCreateModalCompany] = useState<CompanyVal | "CROSS" | null>(null);
  const [editingPos, setEditingPos] = useState<Position | null>(null);

  const userById = useMemo(() => {
    const m = new Map<string, UserOption>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const crossPositions = useMemo(() => positions.filter((p) => p.company === null), [positions]);
  const mobilePositions = useMemo(() => positions.filter((p) => p.company === "MOBILE"), [positions]);
  const resortPositions = useMemo(() => positions.filter((p) => p.company === "RESORT"), [positions]);

  const showMobile = view === "BOTH" || view === "MOBILE";
  const showResort = view === "BOTH" || view === "RESORT";
  const showCross = view === "BOTH";

  if (positions.length === 0) {
    return (
      <EmptyState
        isSuperAdmin={isSuperAdmin}
        onSeeded={(newPositions) => setPositions(newPositions)}
      />
    );
  }

  async function savePatch(positionId: string, body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/org-chart/${positionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }
      return await res.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateParent(positionId: string, parentPositionId: string | null) {
    const prev = positions;
    setPositions((p) =>
      p.map((x) => (x.id === positionId ? { ...x, parentPositionId } : x))
    );
    const result = await savePatch(positionId, { parentPositionId });
    if (!result) setPositions(prev);
  }

  async function assignUser(positionId: string, assignedUserId: string | null) {
    const prev = positions;
    setPositions((p) =>
      p.map((x) => {
        // Unassign user from any other position they held
        if (assignedUserId && x.assignedUserId === assignedUserId && x.id !== positionId) {
          return { ...x, assignedUserId: null };
        }
        if (x.id === positionId) return { ...x, assignedUserId };
        return x;
      })
    );
    const result = await savePatch(positionId, { assignedUserId });
    if (!result) setPositions(prev);
  }

  async function updateTitle(positionId: string, title: string) {
    const prev = positions;
    setPositions((p) =>
      p.map((x) => (x.id === positionId ? { ...x, title } : x))
    );
    const result = await savePatch(positionId, { title });
    if (!result) setPositions(prev);
  }

  async function deletePosition(positionId: string) {
    if (!confirm("Delete this position? Children will be re-parented one level up.")) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/org-chart/${positionId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      // Re-parent locally + remove
      const gone = positions.find((p) => p.id === positionId);
      const newParent = gone?.parentPositionId ?? null;
      setPositions((p) =>
        p
          .filter((x) => x.id !== positionId)
          .map((x) =>
            x.parentPositionId === positionId ? { ...x, parentPositionId: newParent } : x
          )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  async function createPosition(title: string, company: CompanyVal | null, parentId: string | null) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/org-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, company, parentPositionId: parentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }
      const pos = await res.json();
      setPositions((p) => [...p, pos]);
      setCreateModalCompany(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  function handleDragStart(e: React.DragEvent, posId: string) {
    setDraggingId(posId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", posId);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverRoot(null);
  }
  function handleDropOnPosition(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData("text/plain");
    setDragOverId(null);
    setDragOverRoot(null);
    if (sourceId && sourceId !== targetId) {
      updateParent(sourceId, targetId);
    }
  }
  function handleDropOnRoot(e: React.DragEvent) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    setDragOverRoot(null);
    if (sourceId) updateParent(sourceId, null);
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
              <span className="text-sm font-medium text-gray-700">Layout:</span>
              <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
                {(["CHART", "LIST"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLayout(l)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      layout === l ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {l === "CHART" ? "Chart" : "List"}
                  </button>
                ))}
              </div>
            </div>

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

      {view === "BOTH" ? (
        <CompanySection
          title="Planet Pooch Org Chart"
          subtitle="CEO and DOS lead both companies. CMO serves both divisions. Mobile and Resort have dedicated operations leaders."
          company={null}
          positions={positions}
          userById={userById}
          showNames={showNames}
          draggingId={draggingId}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
          dragOverRoot={dragOverRoot === "CROSS"}
          setDragOverRoot={(b) => setDragOverRoot(b ? "CROSS" : null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnPosition={handleDropOnPosition}
          onDropOnRoot={handleDropOnRoot}
          onAssign={(pos) => setAssignModalFor(pos)}
          onEdit={(pos) => setEditingPos(pos)}
          onDelete={deletePosition}
          layout={layout}
          onAdd={() => setCreateModalCompany("CROSS")}
        />
      ) : view === "MOBILE" ? (
        <CompanySection
          title={COMPANY_LABELS.MOBILE}
          subtitle="Mobile grooming division (includes shared cross-company leadership)"
          company="MOBILE"
          positions={[...crossPositions, ...mobilePositions]}
          userById={userById}
          showNames={showNames}
          draggingId={draggingId}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
          dragOverRoot={dragOverRoot === "MOBILE"}
          setDragOverRoot={(b) => setDragOverRoot(b ? "MOBILE" : null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnPosition={handleDropOnPosition}
          onDropOnRoot={handleDropOnRoot}
          onAssign={(pos) => setAssignModalFor(pos)}
          onEdit={(pos) => setEditingPos(pos)}
          onDelete={deletePosition}
          layout={layout}
          onAdd={() => setCreateModalCompany("MOBILE")}
        />
      ) : (
        <CompanySection
          title={COMPANY_LABELS.RESORT}
          subtitle="Pet resort division (includes shared cross-company leadership)"
          company="RESORT"
          positions={[...crossPositions, ...resortPositions]}
          userById={userById}
          showNames={showNames}
          draggingId={draggingId}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
          dragOverRoot={dragOverRoot === "RESORT"}
          setDragOverRoot={(b) => setDragOverRoot(b ? "RESORT" : null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnPosition={handleDropOnPosition}
          onDropOnRoot={handleDropOnRoot}
          onAssign={(pos) => setAssignModalFor(pos)}
          onEdit={(pos) => setEditingPos(pos)}
          onDelete={deletePosition}
          layout={layout}
          onAdd={() => setCreateModalCompany("RESORT")}
        />
      )}

      <p className="text-xs text-gray-400 text-center">
        Drag a position onto another to reassign reporting. Drop on the title area to make it top-level.
      </p>

      {/* Assign Modal */}
      {assignModalFor && (
        <AssignUserModal
          position={assignModalFor}
          users={users.filter(
            (u) => !assignModalFor.company || u.company === assignModalFor.company || u.company === null
          )}
          currentUser={
            assignModalFor.assignedUserId ? userById.get(assignModalFor.assignedUserId) ?? null : null
          }
          onClose={() => setAssignModalFor(null)}
          onAssign={async (userId) => {
            await assignUser(assignModalFor.id, userId);
            setAssignModalFor(null);
          }}
        />
      )}

      {/* Create Modal */}
      {createModalCompany && (
        <CreatePositionModal
          company={createModalCompany === "CROSS" ? null : createModalCompany}
          parentOptions={positions.filter(
            (p) =>
              createModalCompany === "CROSS"
                ? p.company === null
                : p.company === createModalCompany || p.company === null
          )}
          onClose={() => setCreateModalCompany(null)}
          onCreate={(title, parentId) =>
            createPosition(
              title,
              createModalCompany === "CROSS" ? null : (createModalCompany as CompanyVal),
              parentId
            )
          }
        />
      )}

      {/* Edit Modal */}
      {editingPos && (
        <EditPositionModal
          position={editingPos}
          onClose={() => setEditingPos(null)}
          onSave={async (title) => {
            await updateTitle(editingPos.id, title);
            setEditingPos(null);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Empty state
// ──────────────────────────────────────────────────────────────────────────────

function EmptyState({
  isSuperAdmin,
  onSeeded,
}: {
  isSuperAdmin: boolean;
  onSeeded: (positions: Position[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function seed() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/org-chart/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to seed");
      }
      // Re-fetch
      const getRes = await fetch("/api/org-chart");
      const data = await getRes.json();
      onSeeded(data.positions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="text-5xl mb-4">🗂️</div>
        <h2 className="text-lg font-semibold text-gray-900">No positions yet</h2>
        <p className="text-gray-500 mt-2 max-w-md mx-auto">
          Start with the standard Planet Pooch org structure (CEO, COO, CMO, Groomer, Office Staff,
          Facility Manager, Assistant Manager, Front Desk Staff, Floor Staff, DOS)
          — then customize.
        </p>
        {isSuperAdmin ? (
          <div className="mt-4">
            <Button onClick={seed} disabled={loading}>
              {loading ? "Seeding…" : "Create standard positions"}
            </Button>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-4 italic">
            Ask a Super Admin to seed the org chart, or create positions manually.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Company section
// ──────────────────────────────────────────────────────────────────────────────

function CompanySection({
  title,
  subtitle,
  company,
  positions,
  userById,
  showNames,
  draggingId,
  dragOverId,
  setDragOverId,
  dragOverRoot,
  setDragOverRoot,
  onDragStart,
  onDragEnd,
  onDropOnPosition,
  onDropOnRoot,
  onAssign,
  onEdit,
  onDelete,
  onAdd,
  layout,
}: {
  title: string;
  subtitle: string;
  company: CompanyVal | null;
  positions: Position[];
  userById: Map<string, UserOption>;
  showNames: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  dragOverRoot: boolean;
  setDragOverRoot: (b: boolean) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDropOnPosition: (e: React.DragEvent, id: string) => void;
  onDropOnRoot: (e: React.DragEvent) => void;
  onAssign: (pos: Position) => void;
  onEdit: (pos: Position) => void;
  onDelete: (positionId: string) => void;
  onAdd: () => void;
  layout: "LIST" | "CHART";
}) {
  const ids = new Set(positions.map((p) => p.id));
  const roots = positions.filter((p) => !p.parentPositionId || !ids.has(p.parentPositionId));

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
          className={`mb-4 pb-3 border-b transition-colors flex items-start justify-between gap-4 ${
            dragOverRoot ? "bg-blue-50 border-blue-300" : "border-gray-200"
          }`}
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
            {dragOverRoot && (
              <p className="text-xs text-blue-600 mt-1">Drop here to make top-level</p>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={onAdd}>
            + Add Position
          </Button>
        </div>

        {positions.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No positions for this company yet. Click "+ Add Position".
          </p>
        ) : layout === "LIST" ? (
          <div className="space-y-2">
            {roots.map((root) => (
              <PositionNode
                key={root.id}
                node={root}
                allPositions={positions}
                depth={0}
                userById={userById}
                showNames={showNames}
                draggingId={draggingId}
                dragOverId={dragOverId}
                setDragOverId={setDragOverId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropOnPosition={onDropOnPosition}
                onAssign={onAssign}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <OrgChartTree
            roots={roots}
            allPositions={positions}
            userById={userById}
            showNames={showNames}
            draggingId={draggingId}
            dragOverId={dragOverId}
            setDragOverId={setDragOverId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOnPosition={onDropOnPosition}
            onAssign={onAssign}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Single node in the tree
// ──────────────────────────────────────────────────────────────────────────────

function PositionNode({
  node,
  allPositions,
  depth,
  userById,
  showNames,
  draggingId,
  dragOverId,
  setDragOverId,
  onDragStart,
  onDragEnd,
  onDropOnPosition,
  onAssign,
  onEdit,
  onDelete,
}: {
  node: Position;
  allPositions: Position[];
  depth: number;
  userById: Map<string, UserOption>;
  showNames: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDropOnPosition: (e: React.DragEvent, id: string) => void;
  onAssign: (pos: Position) => void;
  onEdit: (pos: Position) => void;
  onDelete: (positionId: string) => void;
}) {
  const children = allPositions.filter((p) => p.parentPositionId === node.id);
  const assigned = node.assignedUserId ? userById.get(node.assignedUserId) : null;
  const vacant = !assigned;
  const isDragging = draggingId === node.id;
  const isDragOver = dragOverId === node.id;

  // Color by whether vacant or filled
  const cardBg = vacant
    ? "bg-white border-dashed border-gray-300"
    : "bg-blue-50 border-blue-300";

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
        onDrop={(e) => onDropOnPosition(e, node.id)}
        className={`group flex items-center gap-3 px-3 py-2 rounded-lg border cursor-move transition-all ${cardBg} ${
          isDragging ? "opacity-40" : ""
        } ${isDragOver ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
        style={{ marginLeft: depth * 24 }}
      >
        <span className="text-gray-400 text-xs select-none">⋮⋮</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{node.title}</span>
            <CompanyTag company={node.company} />
            {vacant ? (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Vacant</span>
            ) : (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                Filled
              </span>
            )}
          </div>
          {showNames && assigned && (
            <p className="text-sm text-gray-700 mt-0.5 truncate">{assigned.name}</p>
          )}
          {showNames && vacant && (
            <p className="text-xs text-gray-400 italic mt-0.5">— open —</p>
          )}
        </div>

        {children.length > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {children.length} {children.length === 1 ? "report" : "reports"}
          </span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton title={vacant ? "Assign" : "Reassign"} onClick={() => onAssign(node)}>
            👤
          </IconButton>
          <IconButton title="Edit title" onClick={() => onEdit(node)}>
            ✏️
          </IconButton>
          <IconButton title="Delete" onClick={() => onDelete(node.id)}>
            🗑️
          </IconButton>
        </div>
      </div>

      {children.length > 0 && (
        <div className="mt-1 space-y-1 border-l-2 border-gray-200 ml-4">
          {children.map((child) => (
            <PositionNode
              key={child.id}
              node={child}
              allPositions={allPositions}
              depth={depth + 1}
              userById={userById}
              showNames={showNames}
              draggingId={draggingId}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOnPosition={onDropOnPosition}
              onAssign={onAssign}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Chart (tree diagram) layout — boxes connected with lines, top-down
// ──────────────────────────────────────────────────────────────────────────────

function OrgChartTree({
  roots,
  allPositions,
  userById,
  showNames,
  draggingId,
  dragOverId,
  setDragOverId,
  onDragStart,
  onDragEnd,
  onDropOnPosition,
  onAssign,
  onEdit,
  onDelete,
}: {
  roots: Position[];
  allPositions: Position[];
  userById: Map<string, UserOption>;
  showNames: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDropOnPosition: (e: React.DragEvent, id: string) => void;
  onAssign: (pos: Position) => void;
  onEdit: (pos: Position) => void;
  onDelete: (positionId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <style>{`
        .oc-tree, .oc-tree ul { list-style: none; margin: 0; padding: 0; }
        .oc-tree { display: flex; justify-content: center; padding: 12px 4px; }
        .oc-tree ul { display: flex; justify-content: center; padding-top: 24px; position: relative; }
        .oc-tree li { position: relative; padding: 24px 10px 0 10px; display: flex; flex-direction: column; align-items: center; }
        /* Horizontal line across siblings */
        .oc-tree li::before, .oc-tree li::after {
          content: ''; position: absolute; top: 0;
          border-top: 2px solid #cbd5e1; width: 50%; height: 24px;
        }
        .oc-tree li::before { right: 50%; }
        .oc-tree li::after  { left: 50%; border-left: 2px solid #cbd5e1; }
        .oc-tree li:only-child::before, .oc-tree li:only-child::after { display: none; }
        .oc-tree li:only-child { padding-top: 24px; }
        .oc-tree li:first-child::before, .oc-tree li:last-child::after { border: 0 none; }
        .oc-tree li:last-child::before { border-right: 2px solid #cbd5e1; }
        /* Vertical connector down from a node to its children's horizontal line */
        .oc-tree li > ul::before {
          content: ''; position: absolute; top: 0; left: 50%;
          border-left: 2px solid #cbd5e1; height: 24px;
        }
      `}</style>
      <ul className="oc-tree">
        {roots.map((root) => (
          <ChartNode
            key={root.id}
            node={root}
            allPositions={allPositions}
            userById={userById}
            showNames={showNames}
            draggingId={draggingId}
            dragOverId={dragOverId}
            setDragOverId={setDragOverId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropOnPosition={onDropOnPosition}
            onAssign={onAssign}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function ChartNode({
  node,
  allPositions,
  userById,
  showNames,
  draggingId,
  dragOverId,
  setDragOverId,
  onDragStart,
  onDragEnd,
  onDropOnPosition,
  onAssign,
  onEdit,
  onDelete,
}: {
  node: Position;
  allPositions: Position[];
  userById: Map<string, UserOption>;
  showNames: boolean;
  draggingId: string | null;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDropOnPosition: (e: React.DragEvent, id: string) => void;
  onAssign: (pos: Position) => void;
  onEdit: (pos: Position) => void;
  onDelete: (positionId: string) => void;
}) {
  const children = allPositions.filter((p) => p.parentPositionId === node.id);
  const assigned = node.assignedUserId ? userById.get(node.assignedUserId) : null;
  const vacant = !assigned;
  const isDragging = draggingId === node.id;
  const isDragOver = dragOverId === node.id;

  const cardBg = vacant
    ? "bg-white border-dashed border-gray-300"
    : "bg-blue-50 border-blue-300";

  return (
    <li>
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
        onDrop={(e) => onDropOnPosition(e, node.id)}
        className={`group relative w-48 px-3 py-2 rounded-lg border cursor-move transition-all ${cardBg} ${
          isDragging ? "opacity-40" : ""
        } ${isDragOver ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{node.title}</span>
          <CompanyTag company={node.company} />
          {vacant ? (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Vacant</span>
          ) : (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Filled</span>
          )}
        </div>
        {showNames && assigned && (
          <p className="text-xs text-gray-700 mt-1 truncate">{assigned.name}</p>
        )}
        {showNames && vacant && (
          <p className="text-xs text-gray-400 italic mt-1">— open —</p>
        )}

        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton title={vacant ? "Assign" : "Reassign"} onClick={() => onAssign(node)}>
            👤
          </IconButton>
          <IconButton title="Edit title" onClick={() => onEdit(node)}>
            ✏️
          </IconButton>
          <IconButton title="Delete" onClick={() => onDelete(node.id)}>
            🗑️
          </IconButton>
        </div>
      </div>

      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <ChartNode
              key={child.id}
              node={child}
              allPositions={allPositions}
              userById={userById}
              showNames={showNames}
              draggingId={draggingId}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropOnPosition={onDropOnPosition}
              onAssign={onAssign}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CompanyTag({ company }: { company: CompanyVal | null }) {
  if (company === null) {
    return (
      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
        Both
      </span>
    );
  }
  if (company === "MOBILE") {
    return (
      <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium">
        Mobile
      </span>
    );
  }
  return (
    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
      Resort
    </span>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      className="w-6 h-6 flex items-center justify-center text-xs rounded hover:bg-white/60"
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Modals
// ──────────────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function AssignUserModal({
  position,
  users,
  currentUser,
  onClose,
  onAssign,
}: {
  position: Position;
  users: UserOption[];
  currentUser: UserOption | null;
  onClose: () => void;
  onAssign: (userId: string | null) => void;
}) {
  const [selected, setSelected] = useState<string>(position.assignedUserId ?? "");
  const [query, setQuery] = useState("");
  const filtered = users.filter(
    (u) =>
      !query ||
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      (u.jobTitle ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <ModalShell title={`Assign employee to: ${position.title}`} onClose={onClose}>
      {currentUser && (
        <div className="mb-3 p-2 rounded border border-gray-200 bg-gray-50 text-sm">
          Currently: <span className="font-medium">{currentUser.name}</span>
        </div>
      )}
      <input
        type="text"
        placeholder="Search name, email, or job title…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
        <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
          <input
            type="radio"
            name="assign-user"
            value=""
            checked={selected === ""}
            onChange={() => setSelected("")}
          />
          <span className="text-sm text-gray-500 italic">— Vacant (no one assigned) —</span>
        </label>
        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 italic px-3 py-4 text-center">No users match.</p>
        )}
        {filtered.map((u) => (
          <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="assign-user"
              value={u.id}
              checked={selected === u.id}
              onChange={() => setSelected(u.id)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {u.jobTitle ?? u.role} · {u.email}
              </p>
            </div>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onAssign(selected || null)}>Save</Button>
      </div>
    </ModalShell>
  );
}

function CreatePositionModal({
  company,
  parentOptions,
  onClose,
  onCreate,
}: {
  company: CompanyVal | null;
  parentOptions: Position[];
  onClose: () => void;
  onCreate: (title: string, parentId: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const companyLabel = company ? COMPANY_LABELS[company] : "Leadership (cross-company)";

  return (
    <ModalShell title={`New position — ${companyLabel}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Senior Groomer"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Reports to</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— Top level (no parent) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => title.trim() && onCreate(title.trim(), parentId || null)}>
          Create
        </Button>
      </div>
    </ModalShell>
  );
}

function EditPositionModal({
  position,
  onClose,
  onSave,
}: {
  position: Position;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState(position.title);

  return (
    <ModalShell title="Edit position" onClose={onClose}>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => title.trim() && onSave(title.trim())}>Save</Button>
      </div>
    </ModalShell>
  );
}
