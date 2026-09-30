import { NextRequest, NextResponse } from "next/server";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanInsuranceSchema, vanProfileSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(session.user.role) || (await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1 || number > 10) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const insuranceOnly = body?.insuranceOnly === true;
  const insurance = insuranceOnly ? vanInsuranceSchema.safeParse(body) : null;
  const profile = insuranceOnly ? null : vanProfileSchema.safeParse(body);
  if (insurance && !insurance.success) return NextResponse.json({ error: insurance.error.issues[0]?.message || "Invalid insurance details" }, { status: 400 });
  if (profile && !profile.success) return NextResponse.json({ error: profile.error.issues[0]?.message || "Invalid vehicle details" }, { status: 400 });
  const details = (insurance?.success ? insurance.data : null) ?? (() => {
    if (!profile?.success) throw new Error("Invalid vehicle details");
    const { registrationExpiry, insuranceExpiry, inspectionExpiry, ...rest } = profile.data;
    return { ...rest, registrationExpiry: dateOrNull(registrationExpiry), insuranceExpiry: dateOrNull(insuranceExpiry), inspectionExpiry: dateOrNull(inspectionExpiry) };
  })();
  const updated = await prisma.groomingVan.updateMany({ where: { number }, data: details });
  if (!updated.count) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
