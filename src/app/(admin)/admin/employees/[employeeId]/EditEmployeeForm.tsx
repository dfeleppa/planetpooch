"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Role = "SUPER_ADMIN" | "MANAGER" | "EMPLOYEE" | "ADMIN";
type Company = "MOBILE" | "RESORT";

interface Props {
  employee: {
    id: string;
    name: string;
    email: string;
    role: Role;
    company: Company | null;
    jobTitle: string | null;
    department: string | null;
    phone: string | null;
    hireDate: string | null;
  };
  canEditCompany: boolean;
  canAssignSuperAdmin: boolean;
  canEditRole: boolean;
}

const JOB_TITLES: Record<"NONE" | Company, string[]> = {
  NONE: ["CEO", "DOS", "CMO"],
  MOBILE: ["COO", "Groomer", "Office Staff"],
  RESORT: ["Facility Manager", "Assistant Manager", "Training Manager", "In-house Groomer", "Front Desk Staff", "Floor Staff"],
};

export function EditEmployeeForm({ employee, canEditCompany, canAssignSuperAdmin, canEditRole }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(employee.name);
  const [email, setEmail] = useState(
    employee.email.endsWith("@placeholder.local") ? "" : employee.email
  );
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [role, setRole] = useState<Role>(employee.role);
  const [company, setCompany] = useState<Company | "">(employee.company ?? "");
  const [jobTitle, setJobTitle] = useState(employee.jobTitle ?? "");
  const [customTitle, setCustomTitle] = useState(false);
  const [hireDate, setHireDate] = useState(
    employee.hireDate ? employee.hireDate.slice(0, 10) : ""
  );

  const companyKey = (company || "NONE") as "NONE" | Company;
  const titleOptions = JOB_TITLES[companyKey];
  const isCustom = customTitle || (jobTitle && !titleOptions.includes(jobTitle));

  function cancel() {
    setName(employee.name);
    setEmail(employee.email.endsWith("@placeholder.local") ? "" : employee.email);
    setPhone(employee.phone ?? "");
    setRole(employee.role);
    setCompany(employee.company ?? "");
    setJobTitle(employee.jobTitle ?? "");
    setHireDate(employee.hireDate ? employee.hireDate.slice(0, 10) : "");
    setCustomTitle(false);
    setError("");
    setEditing(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          role: canEditRole ? role : undefined,
          company: canEditCompany ? (company || null) : undefined,
          jobTitle,
          hireDate: hireDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Employee Info</h2>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Name" value={employee.name} />
          <Field
            label="Email"
            value={
              employee.email.endsWith("@placeholder.local")
                ? "— (not set)"
                : employee.email
            }
          />
          <Field label="Phone" value={employee.phone || "—"} />
          <Field label="Role" value={employee.role} />
          <Field label="Company" value={employee.company ?? "— Cross-company —"} />
          <Field label="Job Title" value={employee.jobTitle || "—"} />
          <Field
            label="Hire Date"
            value={employee.hireDate ? employee.hireDate.slice(0, 10) : "—"}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-gray-900">Edit Employee</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@planetpooch.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Company</label>
              {canEditCompany ? (
                <select
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value as Company | "");
                    setJobTitle("");
                    setCustomTitle(false);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None (Cross-Company) —</option>
                  <option value="MOBILE">Planet Pooch Mobile Inc</option>
                  <option value="RESORT">Planet Pooch Pet Resort Inc</option>
                </select>
              ) : (
                <input
                  readOnly
                  value={company || "—"}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Role</label>
              {canEditRole ? (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  {canAssignSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
                </select>
              ) : (
                <input
                  readOnly
                  value={role}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Job Title</label>
            <select
              value={isCustom ? "__custom__" : jobTitle}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomTitle(true);
                  setJobTitle("");
                } else {
                  setCustomTitle(false);
                  setJobTitle(e.target.value);
                }
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select a position —</option>
              {titleOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__custom__">Other / Custom…</option>
            </select>
            {isCustom && (
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Enter job title"
                className="mt-1"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
            <Input
              label="Hire Date"
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
