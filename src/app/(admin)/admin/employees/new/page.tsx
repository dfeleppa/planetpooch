import { requireManager } from "@/lib/auth-helpers";
import { NewEmployeeForm } from "./NewEmployeeForm";
import Link from "next/link";
import { Company, Role } from "@prisma/client";

export default async function NewEmployeePage() {
  const session = await requireManager();
  const user = session.user as { role: Role; company: Company };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/admin/employees"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to employees
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Add Employee</h1>
        <p className="text-gray-500 mt-1">
          Create a new account. After creation you can email the employee a
          temporary password and a link to sign in.
        </p>
      </div>
      <NewEmployeeForm currentRole={user.role} currentCompany={user.company} />
    </div>
  );
}
