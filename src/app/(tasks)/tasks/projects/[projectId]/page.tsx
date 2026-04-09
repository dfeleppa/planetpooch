import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProjectBoard } from "./ProjectBoard";
import Link from "next/link";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      subProjects: { orderBy: { order: "asc" } },
      tasks: {
        where: { parentTaskId: null },
        orderBy: [{ order: "asc" }],
        include: {
          assignees: { include: { user: { select: { id: true, name: true } } } },
          _count: { select: { subtasks: true, comments: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  const isMember = project.members.some((m) => m.userId === session!.user.id);
  if (!isMember && !isAdmin) redirect("/tasks");

  const isOwner = project.ownerId === session!.user.id;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/tasks" className="hover:text-blue-600">Tasks</Link>
        <span>/</span>
        <span className="text-gray-900">{project.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/tasks/projects/${projectId}/tasks/new`}>
            <Button size="sm">+ Add Task</Button>
          </Link>
          {(isOwner || isAdmin) && (
            <Link href={`/tasks/projects/${projectId}/settings`}>
              <Button variant="secondary" size="sm">Settings</Button>
            </Link>
          )}
        </div>
      </div>

      <ProjectBoard
        project={{
          id: project.id,
          tasks: project.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate?.toISOString() ?? null,
            assignees: t.assignees.map((a) => a.user),
            subtaskCount: t._count.subtasks,
            commentCount: t._count.comments,
          })),
          subProjects: project.subProjects,
        }}
      />
    </div>
  );
}
