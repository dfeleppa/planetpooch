"use client";

import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  label?: string;
}

export function Tabs({ tabs, activeTab, onChange, className, label = "Views" }: TabsProps) {
  return (
      <div className={cn("pp-tabs", className)} role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item.id === tab.id);
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              buttons?.[next]?.focus();
              onChange(tabs[next].id);
            }}
            className={cn(
              "pp-tab", activeTab === tab.id && "is-on"
            )}
          >
            {tab.label}
          </button>
        ))}
    </div>
  );
}
