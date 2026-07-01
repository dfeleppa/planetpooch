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

export async function PayrollPageContent({
  business,
}: {
  business: PayrollBusinessValue;
}) {
  await requireSuperAdmin();

  const mobileGroomingEmployees =
    business === "mobile-grooming"
      ? await prisma.user.findMany({
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
        })
      : [];

  const employeeOptionsByBusiness: Partial<
    Record<PayrollBusinessValue, PayrollEmployeeOption[]>
  > =
    business === "mobile-grooming"
      ? {
          "mobile-grooming": mobileGroomingEmployees.map((employee) => ({
            id: employee.id,
            name: employeeName(employee),
          })),
        }
      : {};

  return (
    <PayrollDashboard
      initialBusiness={business}
      employeeOptionsByBusiness={employeeOptionsByBusiness}
    />
  );
}
