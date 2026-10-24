import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isValidPayrollWeekStart, normalizeEmployeeName, type PayrollBusinessValue } from "@/lib/payroll";
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
  cashManagementMode = false,
  startOnPayouts = false,
  startOnWeeklyCloseout = false,
  requestedWeek,
}: {
  business: PayrollBusinessValue;
  cashManagementMode?: boolean;
  startOnPayouts?: boolean;
  startOnWeeklyCloseout?: boolean;
  requestedWeek?: string;
}) {
  await requireSuperAdmin();
  const parsedWeek = requestedWeek ? new Date(`${requestedWeek}T00:00:00Z`) : null;
  const initialWeekStart = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) && parsedWeek &&
    Number.isFinite(parsedWeek.getTime()) && parsedWeek.toISOString().slice(0, 10) === requestedWeek &&
    isValidPayrollWeekStart(parsedWeek, business) ? requestedWeek : undefined;

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
      cashManagementMode={cashManagementMode}
      startOnPayouts={startOnPayouts}
      startOnWeeklyCloseout={startOnWeeklyCloseout}
      initialWeekStart={initialWeekStart}
    />
  );
}
