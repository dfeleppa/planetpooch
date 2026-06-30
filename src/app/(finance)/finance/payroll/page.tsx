import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { normalizeEmployeeName, type PayrollBusinessValue } from "@/lib/payroll";
import { PayrollDashboard } from "./PayrollDashboard";

type PayrollEmployeeOption = {
  id: string;
  name: string;
};

function employeeName(employee: {
  firstName: string;
  lastName: string;
  name: string;
}) {
  const fromParts = normalizeEmployeeName(`${employee.firstName} ${employee.lastName}`);
  return fromParts || normalizeEmployeeName(employee.name);
}

export default async function PayrollPage() {
  await requireSuperAdmin();

  const mobileGroomingEmployees = await prisma.user.findMany({
    where: {
      company: "GROOMING",
      terminatedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const employeeOptionsByBusiness: Partial<
    Record<PayrollBusinessValue, PayrollEmployeeOption[]>
  > = {
    "mobile-grooming": mobileGroomingEmployees.map((employee) => ({
      id: employee.id,
      name: employeeName(employee),
    })),
  };

  return <PayrollDashboard employeeOptionsByBusiness={employeeOptionsByBusiness} />;
}
