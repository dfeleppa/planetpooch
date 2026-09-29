import { NextRequest, NextResponse } from "next/server";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanRecordSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(session.user.role) || (await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1 || number > 10) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const parsed = vanRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid maintenance record" }, { status: 400 });
  const van = await prisma.groomingVan.findUnique({ where: { number }, select: { id: true } });
  if (!van) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const { serviceDate, nextDueDate, cost, ...details } = parsed.data;
  const created = await prisma.groomingVanMaintenance.create({
    data: { ...details, vanId: van.id, serviceDate: dateOrNull(serviceDate)!, nextDueDate: dateOrNull(nextDueDate), cost: cost ? cost : null },
    select: { id: true },
  });
  return NextResponse.json(created, { status: 201 });
}
