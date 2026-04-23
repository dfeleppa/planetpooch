"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Role = "SUPER_ADMIN" | "MANAGER" | "EMPLOYEE" | "ADMIN";
type Company = "MOBILE" | "RESORT";

interface Props {
  currentRole: Role;
  currentCompany: Company | null;
}

const COMPANY_LABELS: Record<Company, string> = {
  MOBILE: "Planet Pooch Mobile Inc",
  RESORT: "Planet Pooch Pet Resort Inc",
};

export function NewEmployeeForm({ currentRole, currentCompany }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  // For MANAGERs the company is locked to their own; SUPER_ADMIN picks freely.
  const [company, setCompany] = useState<Company | "">(currentCompany ?? "");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [hireDate, setHireDate] = useState("");

  const isSuperAdmin = currentRole === "SUPER_ADMIN" || currentRole === "ADMIN";
  const isManager = currentRole === "MANAGER";

  // Shown once after successful create.
  const [result, setResult] = useState<{
    user: { id: string; name: string; email: string };
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          company: company || null,
          jobTitle,
          department,
          phone,
          hireDate: hireDate || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create employee");
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (result) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Employee created
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {result.user.name} &lt;{result.user.email}&gt;
            </p>
          </div>

          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
            <p className="text-sm font-medium text-yellow-900">
              Temporary password — shown only once
            </p>
            <p className="text-xs text-yellow-800 mt-1">
              Copy this and share it securely with the employee. They will be
              required to change it on first login.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded bg-white border border-yellow-300 px-3 py-2 text-sm font-mono">
                {result.tempPassword}
              </code>
              <Button type="button" variant="secondary" onClick={copyPassword}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link href="/admin/employees">
              <Button type="button">Back to employees</Button>
            </Link>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setResult(null);
                setName("");
                setEmail("");
                setRole("EMPLOYEE");
                setCompany(currentCompany ?? "");
                setJobTitle("");
                setDepartment("");
                setPhone("");
                setHireDate("");
              }}
            >
              Add another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4">
          <Input
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Role */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
              </select>
            </div>

            {/* Company — locked for MANAGERs */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Company</label>
              {isManager ? (
                <input
                  readOnly
                  value={currentCompany ? COMPANY_LABELS[currentCompany] : "—"}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
              ) : (
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value as Company | "")}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— None (Super Admin) —</option>
                  <option value="MOBILE">Planet Pooch Mobile Inc</option>
                  <option value="RESORT">Planet Pooch Pet Resort Inc</option>
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Job Title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Groomer"
            />
            <Input
              label="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g., Operations"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Phone"
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

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Employee"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
