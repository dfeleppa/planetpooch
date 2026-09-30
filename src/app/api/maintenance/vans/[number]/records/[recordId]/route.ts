import { NextRequest, NextResponse } from "next/server";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanRecordSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ number: string; recordId: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(session.user.role) || (await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { number: rawNumber, recordId } = await params;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number) || number < 1) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const parsed = vanRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid maintenance record" }, { status: 400 });
  const { serviceDate, nextDueDate, cost, ...details } = parsed.data;
  const updated = await prisma.groomingVanMaintenance.updateMany({
    where: { id: recordId, van: { number } },
    data: { ...details, serviceDate: dateOrNull(serviceDate)!, nextDueDate: dateOrNull(nextDueDate), cost: cost ? cost : null },
  });
  if (!updated.count) return NextResponse.json({ error: "Maintenance record not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
