import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { NewTaskForm } from "./NewTaskForm";
import Link from "next/link";

export default async function NewTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ parentTaskId?: string }>;
}) {
  await requireAuth();
  const { projectId } = await params;
  const { parentTaskId } = await searchParams;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      subProjects: { orderBy: { order: "asc" } },
      members: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (!project) notFound();

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/tasks" className="hover:text-blue-600">Tasks</Link>
        <span>/</span>
        <Link href={`/tasks/projects/${projectId}`} className="hover:text-blue-600">{project.name}</Link>
        <span>/</span>
        <span className="text-gray-900">{parentTaskId ? "New Subtask" : "New Task"}</span>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{parentTaskId ? "New Subtask" : "New Task"}</h1>
      </div>
      <NewTaskForm
        projectId={projectId}
        subProjects={project.subProjects}
        members={project.members.map((m) => m.user)}
        parentTaskId={parentTaskId ?? null}
      />
    </div>
  );
}
