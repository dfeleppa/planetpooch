"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Company } from "@prisma/client";

type Tab = "active" | "terminated";

type SortOption = { key: string; label: string };

interface Props {
  tab: Tab;
  isSuperAdmin: boolean;
  q: string;
  company: Company | "";
  jobTitle: string;
  sort: string;
  defaultSort: string;
  jobTitleOptions: string[];
  sortOptions: SortOption[];
  companyLabels: Record<Company, string>;
  hasActiveFilters: boolean;
}

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
  }) {
    const params = new URLSearchParams();
    params.set("status", props.tab);
    if (next.q) params.set("q", next.q);
    if (next.company) params.set("company", String(next.company));
    if (next.jobTitle) params.set("jobTitle", next.jobTitle);
    if (next.sort && next.sort !== props.defaultSort) params.set("sort", next.sort);
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
    });
  }

  function onCompanyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({
      q: search,
      company: (e.target.value || "") as Company | "",
      jobTitle: props.jobTitle,
      sort: props.sort,
    });
  }

  function onJobTitleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({
      q: search,
      company: props.company,
      jobTitle: e.target.value,
      sort: props.sort,
    });
  }

  function onSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    navigate({
      q: search,
      company: props.company,
      jobTitle: props.jobTitle,
      sort: e.target.value,
    });
  }

  const resetHref =
    props.tab === "terminated" ? "/admin/employees?status=terminated" : "/admin/employees";

  return (
    <form
      onSubmit={onSearchSubmit}
      className="mt-4 flex flex-wrap items-end gap-3"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="text-xs text-gray-500 uppercase tracking-wide">
          Search
        </label>
        <input
          type="text"
          name="q"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or email — press Enter"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {props.isSuperAdmin && (
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide">
            Company
          </label>
          <select
            value={props.company}
            onChange={onCompanyChange}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {(Object.keys(props.companyLabels) as Company[]).map((c) => (
              <option key={c} value={c}>
                {props.companyLabels[c]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide">
          Job title
        </label>
        <select
          value={props.jobTitle}
          onChange={onJobTitleChange}
          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All</option>
          {props.jobTitleOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide">
          Sort
        </label>
        <select
          value={props.sort}
          onChange={onSortChange}
          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {props.sortOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {props.hasActiveFilters && (
        <Link
          href={resetHref}
          className="text-sm text-gray-500 hover:text-gray-700 pb-2"
        >
          Reset
        </Link>
      )}
    </form>
  );
}
