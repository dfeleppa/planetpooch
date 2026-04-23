import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

/**
 * POST — seeds the canonical org chart: Leadership + Mobile + Resort hierarchies.
 * Refuses to run if positions already exist (pass { force: true } to wipe + reseed).
 * SUPER_ADMIN only since this creates cross-company leadership.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden (SUPER_ADMIN only)" }, { status: 403 });
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body?.force;
  } catch {
    // no body is fine
  }

  const existing = await prisma.orgPosition.count();
  if (existing > 0 && !force) {
    return NextResponse.json(
      { error: "Positions already exist. Pass { force: true } to wipe and reseed." },
      { status: 409 }
    );
  }

  if (force) {
    await prisma.orgPosition.deleteMany({});
  }

  // Build hierarchy
  const ceo = await prisma.orgPosition.create({
    data: { title: "CEO", company: null, order: 0 },
  });
  await prisma.orgPosition.create({
    data: {
      title: "DOS",
      company: null,
      parentPositionId: ceo.id,
      order: 1,
    },
  });

  // Mobile
  const coo = await prisma.orgPosition.create({
    data: {
      title: "COO",
      company: Company.MOBILE,
      parentPositionId: ceo.id,
      order: 0,
    },
  });
  // CMO is cross-company (serves both Mobile and Resort)
  await prisma.orgPosition.create({
    data: {
      title: "CMO",
      company: null,
      parentPositionId: ceo.id,
      order: 2,
    },
  });
  await prisma.orgPosition.create({
    data: {
      title: "Groomer",
      company: Company.MOBILE,
      parentPositionId: coo.id,
      order: 1,
    },
  });
  // Office Staff reports to COO (CMO is marketing, not ops)
  await prisma.orgPosition.create({
    data: {
      title: "Office Staff",
      company: Company.MOBILE,
      parentPositionId: coo.id,
      order: 2,
    },
  });

  // Resort
  const facilityMgr = await prisma.orgPosition.create({
    data: {
      title: "Facility Manager",
      company: Company.RESORT,
      parentPositionId: ceo.id,
      order: 0,
    },
  });
  const asstMgr = await prisma.orgPosition.create({
    data: {
      title: "Assistant Manager",
      company: Company.RESORT,
      parentPositionId: facilityMgr.id,
      order: 0,
    },
  });
  await prisma.orgPosition.create({
    data: {
      title: "Training Manager",
      company: Company.RESORT,
      parentPositionId: facilityMgr.id,
      order: 1,
    },
  });
  await prisma.orgPosition.create({
    data: {
      title: "Front Desk Staff",
      company: Company.RESORT,
      parentPositionId: asstMgr.id,
      order: 0,
    },
  });
  await prisma.orgPosition.create({
    data: {
      title: "Floor Staff",
      company: Company.RESORT,
      parentPositionId: asstMgr.id,
      order: 1,
    },
  });
  await prisma.orgPosition.create({
    data: {
      title: "In-house Groomer",
      company: Company.RESORT,
      parentPositionId: asstMgr.id,
      order: 2,
    },
  });

  // Best-effort: auto-assign existing users whose jobTitle matches a seeded position
  const users = await prisma.user.findMany({
    where: { jobTitle: { not: null } },
    select: { id: true, jobTitle: true, company: true, role: true },
  });
  for (const u of users) {
    if (!u.jobTitle) continue;
    const match = await prisma.orgPosition.findFirst({
      where: {
        title: u.jobTitle,
        // Cross-company positions for SUPER_ADMIN users with no company
        company: u.company ?? null,
        assignedUserId: null,
      },
    });
    if (match) {
      await prisma.orgPosition.update({
        where: { id: match.id },
        data: { assignedUserId: u.id },
      });
    }
  }

  return NextResponse.json({ success: true });
}
