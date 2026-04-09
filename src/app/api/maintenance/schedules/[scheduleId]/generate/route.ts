import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { generateMaintenanceTask } from "@/lib/maintenance";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await getSession();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scheduleId } = await params;
  const task = await generateMaintenanceTask(scheduleId);

  if (!task) {
    return NextResponse.json({ error: "Schedule not found or inactive" }, { status: 404 });
  }

  return NextResponse.json(task, { status: 201 });
}
