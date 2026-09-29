import { NextRequest, NextResponse } from "next/server";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanProfileSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(session.user.role) || (await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1 || number > 10) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const parsed = vanProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid vehicle details" }, { status: 400 });
  const { registrationExpiry, insuranceExpiry, inspectionExpiry, ...details } = parsed.data;
  const updated = await prisma.groomingVan.updateMany({
    where: { number },
    data: { ...details, registrationExpiry: dateOrNull(registrationExpiry), insuranceExpiry: dateOrNull(insuranceExpiry), inspectionExpiry: dateOrNull(inspectionExpiry) },
  });
  if (!updated.count) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
