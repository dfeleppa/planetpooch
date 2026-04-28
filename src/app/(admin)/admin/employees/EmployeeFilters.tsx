"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Company } from "@prisma/client";
import { cn } from "@/lib/utils";

type Tab = "active" | "terminated";

type SortOption = { key: string; label: string };

type ProgressFilter = "all" | "atrisk" | "notstarted" | "done";

interface ProgressCounts {
  all: number;
  atrisk: number;
  notstarted: number;
  done: number;
}

interface Props {
  tab: Tab;
  isSuperAdmin: boolean;
  q: string;
  company: Company | "";
  jobTitle: string;
  sort: string;
  progress: ProgressFilter;
  defaultSort: string;
  jobTitleOptions: string[];
  sortOptions: SortOption[];
  companyLabels: Record<Company, string>;
  progressCounts: ProgressCounts;
  hasActiveFilters: boolean;
}

const PROGRESS_CHIPS: { key: ProgressFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "atrisk", label: "At risk" },
  { key: "notstarted", label: "Not started" },
  { key: "done", label: "Complete" },
];

export function EmployeeFilters(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Local search state so dropdown changes don't blow away an in-progress
  // search that hasn't been submitted yet.
  const [search, setSearch] = useState(props.q);

  function navigate(next: {
    q: string;
    company: Company | "";
    jobTitle: string;
    sort: string;
    progress: ProgressFilter;
  }) {
    const params = new URLSearchParams();
    params.set("status", props.tab);
    if (next.q) params.set("q", next.q);
    if (next.company) params.set("company", String(next.company));
    if (next.jobTitle) params.set("jobTitle", next.jobTitle);
    if (next.sort && next.sort !== props.defaultSort) params.set("sort", next.sort);
    if (next.progress !== "all") params.set("progress", next.progress);
    startTransition(() => {
      router.push(`/admin/employees?${params.toString()}`);
    });
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate({
      q: search,
      company: props.company,
      jobTitle: props.jobTitle,
      sort: props.sort,
      progress: props.progress,
    });
  }

  function onCompanyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({
      q: search,
      company: (e.target.value || "") as Company | "",
      jobTitle: props.jobTitle,
      sort: props.sort,
      progress: props.progress,
    });
  }

  function onJobTitleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({
      q: search,
      company: props.company,
      jobTitle: e.target.value,
      sort: props.sort,
      progress: props.progress,
    });
  }

  function onSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({
      q: search,
      company: props.company,
      jobTitle: props.jobTitle,
      sort: e.target.value,
      progress: props.progress,
    });
  }

  function onProgressChip(next: ProgressFilter) {
    navigate({
      q: search,
      company: props.company,
      jobTitle: props.jobTitle,
      sort: props.sort,
      progress: next,
    });
  }

  const resetHref =
    props.tab === "terminated" ? "/admin/employees?status=terminated" : "/admin/employees";

  const showProgressChips = props.tab === "active";

  return (
    <form onSubmit={onSearchSubmit} className="pp-toolbar">
      <div className="pp-search">
        <span className="pp-search-icon" aria-hidden>⌕</span>
        <input
          type="text"
          name="q"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
        />
        <kbd className="pp-kbd">↵</kbd>
      </div>

      {showProgressChips && (
        <div className="pp-chips">
          {PROGRESS_CHIPS.map((chip) => {
            const count = props.progressCounts[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onProgressChip(chip.key)}
                className={cn("pp-chip", props.progress === chip.key && "is-on")}
              >
                {chip.label}
                <span className="pp-chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="pp-spacer" />

      {props.isSuperAdmin && (
        <div className="pp-select-group">
          <label htmlFor="company-select">Company</label>
          <select id="company-select" value={props.company} onChange={onCompanyChange}>
            <option value="">All</option>
            {(Object.keys(props.companyLabels) as Company[]).map((c) => (
              <option key={c} value={c}>
                {props.companyLabels[c]}
              </option>
            ))}
          </select>
        </div>
      )}

      {props.jobTitleOptions.length > 0 && (
        <div className="pp-select-group">
          <label htmlFor="jobtitle-select">Job title</label>
          <select id="jobtitle-select" value={props.jobTitle} onChange={onJobTitleChange}>
            <option value="">All</option>
            {props.jobTitleOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="pp-select-group">
        <label htmlFor="sort-select">Sort</label>
        <select id="sort-select" value={props.sort} onChange={onSortChange}>
          {props.sortOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {props.hasActiveFilters && (
        <Link href={resetHref} className="text-[12px] text-pp-ink-4 hover:text-pp-ink-2">
          Reset
        </Link>
      )}
    </form>
  );
}
