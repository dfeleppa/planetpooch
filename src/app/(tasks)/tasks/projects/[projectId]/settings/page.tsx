import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { ProjectSettingsForm } from "./ProjectSettingsForm";
import Link from "next/link";

export default async function ProjectSettingsPage({
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
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      subProjects: { orderBy: { order: "asc" } },
    },
  });

  if (!project) notFound();

  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  const isOwner = project.ownerId === session!.user.id;
  if (!isOwner && !isAdmin) redirect(`/tasks/projects/${projectId}`);

  const allUsers = await prisma.user.findMany({
    where: { terminatedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/tasks" className="hover:text-blue-600">Tasks</Link>
        <span>/</span>
        <Link href={`/tasks/projects/${projectId}`} className="hover:text-blue-600">{project.name}</Link>
        <span>/</span>
        <span className="text-gray-900">Settings</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>
        <p className="text-gray-500 mt-1">Manage project details, members, and sub-projects</p>
      </div>

      <ProjectSettingsForm
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          members: project.members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role })),
          subProjects: project.subProjects,
        }}
        allUsers={allUsers}
      />
    </div>
  );
}
