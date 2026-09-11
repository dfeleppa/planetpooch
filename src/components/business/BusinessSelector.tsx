"use client";

import { useState } from "react";
import { useBusiness } from "./BusinessProvider";
import type { Business } from "@/lib/business";

export function BusinessSelector({ options }: { options: readonly Business[] }) {
  const business = useBusiness();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  async function switchBusiness(company: string) {
    if (company === business.company) return;
    setSwitching(true);
    setError("");
    try {
      const response = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, href: window.location.pathname + window.location.search }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to switch businesses");
      // A full navigation clears prefetched pages and all business-specific forms.
      window.location.assign(result.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to switch businesses");
      setSwitching(false);
    }
  }

  return (
    <header className="pp-business-header mb-6 flex flex-col items-end gap-3 border-b border-pp-line pb-4 print:hidden">
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-3">
        <label htmlFor="business-selector" className="text-xs font-medium uppercase tracking-wide text-pp-ink-3">Business</label>
        <select id="business-selector" value={business.company} disabled={switching || options.length < 2}
          onChange={(event) => void switchBusiness(event.target.value)}
          className="max-w-full rounded-lg border border-pp-line bg-white px-3 py-2 text-sm font-semibold text-pp-ink focus:outline-none focus:ring-2 focus:ring-pp-accent disabled:opacity-70">
          {options.map((option) => <option key={option.company} value={option.company}>{option.label}</option>)}
        </select>
        {switching && <span role="status" className="text-sm text-pp-ink-3">Switching business…</span>}
      </div>
      {error && <p role="alert" className="text-right text-sm text-red-700">{error}</p>}
    </header>
  );
}
