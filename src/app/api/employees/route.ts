import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/onboarding";

export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { name: "asc" },
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
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, email, role, jobTitle, department, phone, hireDate, managerId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 400 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
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
        email: true,
        role: true,
        jobTitle: true,
        department: true,
      },
    });

    // Return temp password ONCE so admin can share it with the new hire.
    return NextResponse.json({ user, tempPassword }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
