import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/onboarding";
import { createEmployeeFolder } from "@/lib/drive";
import { isValidDayOfWeek, isValidTimeSlot } from "@/lib/availability";
import { Company, DayOfWeek, Role } from "@prisma/client";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(user.role, user.company);

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", ...companyFilter },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      company: true,
      jobTitle: true,
      createdAt: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        include: {
          lessons: { select: { id: true } },
        },
      },
    },
  });

  const allCompletions = await prisma.lessonCompletion.findMany({
    where: { isCompleted: true },
    select: { userId: true, lessonId: true },
  });

  const completionsByUser = new Map<string, Set<string>>();
  for (const c of allCompletions) {
    if (!completionsByUser.has(c.userId)) {
      completionsByUser.set(c.userId, new Set());
    }
    completionsByUser.get(c.userId)!.add(c.lessonId);
  }

  const result = employees.map((emp) => {
    const userCompletions = completionsByUser.get(emp.id) || new Set();
    let totalLessons = 0;
    let totalCompleted = 0;

    const moduleProgress = modules.map((mod) => {
      const lessons = mod.subsections.flatMap((s) => s.lessons);
      const total = lessons.length;
      const completed = lessons.filter((l) => userCompletions.has(l.id)).length;
      totalLessons += total;
      totalCompleted += completed;
      return {
        moduleId: mod.id,
        moduleTitle: mod.title,
        totalLessons: total,
        completedLessons: completed,
      };
    });

    return {
      ...emp,
      totalLessons,
      completedLessons: totalCompleted,
      modules: moduleProgress,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      role,
      company,
      jobTitle,
      department,
      phone,
      hireDate,
      managerId,
      availability,
    } = body;

    // Validate availability up-front so we don't create the User if the
    // payload is malformed. Each entry must have a valid day, valid 30-min
    // slot for both times, and end > start. Days must be unique.
    const availabilityRows: {
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
    }[] = [];
    if (availability !== undefined && availability !== null) {
      if (!Array.isArray(availability)) {
        return NextResponse.json(
          { error: "availability must be an array" },
          { status: 400 }
        );
      }
      const seenDays = new Set<DayOfWeek>();
      for (const entry of availability) {
        if (!entry || typeof entry !== "object") {
          return NextResponse.json(
            { error: "Invalid availability entry" },
            { status: 400 }
          );
        }
        const { dayOfWeek, startTime, endTime } = entry as Record<string, unknown>;
        if (!isValidDayOfWeek(dayOfWeek)) {
          return NextResponse.json(
            { error: `Invalid day of week: ${String(dayOfWeek)}` },
            { status: 400 }
          );
        }
        if (!isValidTimeSlot(startTime) || !isValidTimeSlot(endTime)) {
          return NextResponse.json(
            { error: "Times must be in HH:MM 30-minute increments" },
            { status: 400 }
          );
        }
        if (endTime <= startTime) {
          return NextResponse.json(
            { error: `End time must be after start time for ${dayOfWeek}` },
            { status: 400 }
          );
        }
        if (seenDays.has(dayOfWeek)) {
          return NextResponse.json(
            { error: `Duplicate day in availability: ${dayOfWeek}` },
            { status: 400 }
          );
        }
        seenDays.add(dayOfWeek);
        availabilityRows.push({ dayOfWeek, startTime, endTime });
      }
    }

    const trimmedFirst = typeof firstName === "string" ? firstName.trim() : "";
    const trimmedLast = typeof lastName === "string" ? lastName.trim() : "";
    if (!trimmedFirst || !trimmedLast) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }
    const fullName = `${trimmedFirst} ${trimmedLast}`;

    const sessionUser = session.user as { role: Role; company: Company };

    // MANAGERs can only create employees in their own company. SUPER_ADMINs
    // must pick one of the three companies — there is no "no company" option
    // anymore; CORPORATE is the explicit value for cross-division employees.
    let assignedCompany: Company;
    if (sessionUser.role === "MANAGER") {
      assignedCompany = sessionUser.company;
    } else {
      const valid: Company[] = ["GROOMING", "RESORT", "CORPORATE"];
      if (!valid.includes(company)) {
        return NextResponse.json(
          { error: "Company is required (Grooming, Resort, or Corporate)" },
          { status: 400 }
        );
      }
      assignedCompany = company;
    }

    // Email is optional — generate a placeholder if not provided so the user can
    // still be created (email is used as login identity and must be unique).
    let normalizedEmail: string;
    if (email?.trim()) {
      normalizedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return NextResponse.json({ error: "A user with that email already exists" }, { status: 400 });
      }
    } else {
      const slug = fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "employee";
      const suffix = Math.random().toString(36).slice(2, 8);
      normalizedEmail = `${slug}-${suffix}@placeholder.local`;
    }

    // Only SUPER_ADMIN can create SUPER_ADMIN or MANAGER accounts
    let assignedRole: Role = "EMPLOYEE";
    if (role === "SUPER_ADMIN" && sessionUser.role === "SUPER_ADMIN") {
      assignedRole = "SUPER_ADMIN";
    } else if (role === "MANAGER" && (sessionUser.role === "SUPER_ADMIN" || sessionUser.role === "MANAGER")) {
      assignedRole = "MANAGER";
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: fullName,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        email: normalizedEmail,
        passwordHash,
        role: assignedRole,
        company: assignedCompany,
        mustChangePassword: true,
        jobTitle: jobTitle?.trim() || null,
        department: department?.trim() || null,
        phone: phone?.trim() || null,
        hireDate: hireDate ? new Date(hireDate) : null,
        managerId: managerId || null,
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        company: true,
        jobTitle: true,
        department: true,
      },
    });

    if (availabilityRows.length > 0) {
      await prisma.employeeAvailability.createMany({
        data: availabilityRows.map((row) => ({ userId: user.id, ...row })),
      });
    }

    // Best-effort Drive folder provisioning. In local dev (no WIF env) this
    // returns a stub ID; on Vercel it creates `<Company subfolder>/Last, First/`.
    // Failures are logged but do NOT roll back the user — a missing folder
    // can be repaired later by a separate endpoint.
    try {
      const folderName = `${user.lastName}, ${user.firstName}`;
      const folderId = await createEmployeeFolder(folderName, user.company);
      await prisma.user.update({
        where: { id: user.id },
        data: { driveFolderId: folderId },
      });
    } catch (err) {
      console.error("[employees.POST] Drive folder creation failed:", err);
    }

    return NextResponse.json({ user, tempPassword }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
