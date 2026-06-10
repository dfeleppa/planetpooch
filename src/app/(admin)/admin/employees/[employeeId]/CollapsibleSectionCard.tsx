"use client";

import { useId, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface CollapsibleSectionCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
}

export function CollapsibleSectionCard({
  title,
  children,
  className,
  defaultCollapsed = false,
}: CollapsibleSectionCardProps) {
  const contentId = useId();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <Card className={className}>
      <CardHeader className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          title={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <span aria-hidden>{isCollapsed ? "+" : "-"}</span>
        </button>
      </CardHeader>
      {!isCollapsed && (
        <CardContent id={contentId} className="space-y-4">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
