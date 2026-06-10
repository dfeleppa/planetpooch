import { requireEmployeeManager, getCompanyFilter } from "@/lib/auth-helpers";
import { NewEmployeeForm } from "./NewEmployeeForm";
import Link from "next/link";
import { Company, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COMPANIES: Company[] = ["GROOMING", "RESORT", "CORPORATE"];

function addTitle(
  options: Record<Company, Set<string>>,
  company: Company,
  title: string
) {
  if (title.trim()) options[company].add(title.trim());
}

export default async function NewEmployeePage() {
  const session = await requireEmployeeManager();
  const user = session.user as {
    role: Role;
    company: Company;
    jobTitle: string | null;
  };
  const companyFilter = getCompanyFilter(user.role, user.company, user.jobTitle);
  const positionWhere = companyFilter.company
    ? { OR: [{ company: companyFilter.company }, { company: null }] }
    : {};
  const positions = await prisma.orgPosition.findMany({
    where: positionWhere,
    select: { title: true, company: true },
    orderBy: [{ company: "asc" }, { title: "asc" }],
  });
  const optionSets: Record<Company, Set<string>> = {
    GROOMING: new Set(),
    RESORT: new Set(),
    CORPORATE: new Set(),
  };
  for (const pos of positions) {
    if (pos.company) {
      addTitle(optionSets, pos.company, pos.title);
    } else {
      addTitle(optionSets, "CORPORATE", pos.title);
      if (companyFilter.company) addTitle(optionSets, companyFilter.company, pos.title);
    }
  }
  const jobTitleOptions = Object.fromEntries(
    COMPANIES.map((company) => [
      company,
      Array.from(optionSets[company]).sort((a, b) => a.localeCompare(b)),
    ])
  ) as Record<Company, string[]>;

  return (
    <div className="w-full">
      <div className="mb-6">
        <Link
          href="/admin/employees"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to employees
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Add Employee</h1>
        <p className="text-gray-500 mt-1">
          Create a new employee record and set up their portal access.
        </p>
      </div>
      <NewEmployeeForm
        currentRole={user.role}
        currentCompany={user.company}
        jobTitleOptions={jobTitleOptions}
      />
    </div>
  );
}
