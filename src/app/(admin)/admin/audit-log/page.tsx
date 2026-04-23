"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuditLog {
  id: string;
  action: "COMPLETED" | "UNCOMPLETED";
  timestamp: string;
  previousCompletedAt: string | null;
  user: { id: string; name: string; email: string };
  lesson: {
    id: string;
    title: string;
    subsection: {
      title: string;
      module: { id: string; title: string };
    };
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>("");

  async function loadLogs(page = 1) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (filterAction) params.set("action", filterAction);

    const res = await fetch(`/api/audit-log?${params}`);
    const data = await res.json();
    setLogs(data.logs);
    setPagination(data.pagination);
    setLoading(false);
  }

  useEffect(() => { loadLogs(); }, [filterAction]);

  function formatDate(date: string) {
    return new Date(date).toLocaleString();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
      <p className="text-gray-500 mt-1">Track all lesson completion and uncompletion events</p>

      {/* Filters */}
      <div className="flex gap-3 mt-6">
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Actions</option>
          <option value="COMPLETED">Completed</option>
          <option value="UNCOMPLETED">Uncompleted</option>
        </select>
      </div>

      {/* Log table */}
      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Lesson</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Previous Completion</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(log.timestamp)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{log.user.name}</span>
                      <p className="text-xs text-gray-400">{log.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-900">{log.lesson.title}</span>
                      <p className="text-xs text-gray-400">
                        {log.lesson.subsection.module.title} &gt; {log.lesson.subsection.title}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={log.action === "COMPLETED" ? "success" : "danger"}>
                        {log.action === "COMPLETED" ? "Completed" : "Uncompleted"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {log.previousCompletedAt ? formatDate(log.previousCompletedAt) : "-"}
                    </td>
                  </tr>
                ))}

                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No audit log entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pagination.page <= 1}
                  onClick={() => loadLogs(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadLogs(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="mt-4 text-center text-gray-500">Loading...</div>
      )}
    </div>
  );
}
