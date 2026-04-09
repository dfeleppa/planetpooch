import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { AvatarGroup } from "@/components/ui/AvatarGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";

export default async function TasksDashboardPage() {
  await requireAuth();
  const session = await getServerSession(authOptions);

  const projects = await prisma.project.findMany({
    where: {
      isArchived: false,
      OR: [
        { ownerId: session!.user.id },
        { members: { some: { userId: session!.user.id } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      tasks: {
        where: { parentTaskId: null },
        select: { id: true, status: true },
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 mt-1">Projects and tasks across your team</p>
        </div>
        <Link href="/tasks/projects/new">
          <Button>+ New Project</Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No projects yet"
          description="Create a project to start organizing tasks for your team."
          action={
            <Link href="/tasks/projects/new">
              <Button>+ New Project</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const totalTasks = project.tasks.length;
            const doneTasks = project.tasks.filter((t) => t.status === "DONE").length;
            const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

            return (
              <Link key={project.id} href={`/tasks/projects/${project.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="py-5 flex flex-col gap-3 h-full">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{project.name}</h3>
                      <Badge variant={pct === 100 ? "success" : pct > 0 ? "info" : "default"}>
                        {pct}%
                      </Badge>
                    </div>
                    {project.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{project.description}</p>
                    )}
                    <div className="mt-auto space-y-2">
                      <ProgressBar value={doneTasks} max={totalTasks || 1} />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{doneTasks}/{totalTasks} tasks done</span>
                        <AvatarGroup users={project.members.map((m) => m.user)} max={4} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
