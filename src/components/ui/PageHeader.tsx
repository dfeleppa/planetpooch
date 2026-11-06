import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className }: {
  title: string; description?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return <header className={cn("pp-page-header", className)}>
    <div className="min-w-0">
      <h1 className="pp-h1">{title}</h1>
      {description ? <p className="pp-sub">{description}</p> : null}
    </div>
    {actions ? <div className="pp-page-actions">{actions}</div> : null}
  </header>;
}
