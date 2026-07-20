import { requireEmployeeManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DAYS_OF_WEEK, formatTimeLabel } from "@/lib/availability";
import { Company, Role } from "@prisma/client";
import Link from "next/link";
import { AdminPeopleNav } from "../AdminPeopleNav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

function formatAvailability(startTime: string, endTime: string): string {
  return `${formatTimeLabel(startTime)} – ${formatTimeLabel(endTime)}`;
}

export default async function SchedulingPage() {
  const session = await requireEmployeeManager();
  const sessionUser = session.user as {
    role: Role;
    company: Company | null;
    jobTitle: string | null;
  };
  const companyFilter = getCompanyFilter(
    sessionUser.role,
    sessionUser.company,
    sessionUser.jobTitle,
  );

  const employees = await prisma.user.findMany({
    where: {
      terminatedAt: null,
      AND: [{ company: "RESORT" }, companyFilter],
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      availability: {
        select: { dayOfWeek: true, startTime: true, endTime: true },
      },
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scheduling</h1>
        <p className="mt-1 text-gray-500">
          Review weekly availability for active Planet Pooch Resort employees.
        </p>
      </div>

      <div className="mb-6">
        <AdminPeopleNav active="scheduling" />
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Employee availability</h2>
          <p className="mt-1 text-sm text-gray-500">
            Availability is shown in each employee&apos;s weekly schedule.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="sticky left-0 bg-gray-50">Employee</TableHeader>
                {DAYS_OF_WEEK.map((day) => (
                  <TableHeader key={day.value}>{day.label}</TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((employee) => {
                const availabilityByDay = new Map(
                  employee.availability.map((entry) => [entry.dayOfWeek, entry]),
                );
                return (
                  <TableRow key={employee.id}>
                    <TableCell className="sticky left-0 bg-white font-medium">
                      <Link
                        href={`/admin/employees/${employee.id}`}
                        className="text-gray-900 hover:text-blue-600"
                      >
                        {employee.firstName} {employee.lastName}
                      </Link>
                    </TableCell>
                    {DAYS_OF_WEEK.map((day) => {
                      const entry = availabilityByDay.get(day.value);
                      return (
                        <TableCell
                          key={day.value}
                          className={entry ? "whitespace-nowrap" : "whitespace-nowrap text-gray-400"}
                        >
                          {entry
                            ? formatAvailability(entry.startTime, entry.endTime)
                            : "Unavailable"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                    No active employees found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
