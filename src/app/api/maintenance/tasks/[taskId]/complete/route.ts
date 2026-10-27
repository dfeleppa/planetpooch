import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { completeMaintenanceTask, MaintenanceRequestError } from "@/lib/maintenance-task-completion";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  try {
    const task = await completeMaintenanceTask(prisma, session.user, taskId, await req.json().catch(() => null));
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof MaintenanceRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Maintenance task completion failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not complete task" }, { status: 500 });
  }
}
