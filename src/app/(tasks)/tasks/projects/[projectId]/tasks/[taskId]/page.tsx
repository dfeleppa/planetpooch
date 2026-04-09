import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskDetailActions } from "./TaskDetailActions";
import Link from "next/link";

const STATUS_VARIANT: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  TODO: "default",
  IN_PROGRESS: "info",
  IN_REVIEW: "warning",
  DONE: "success",
  CANCELLED: "danger",
};

const PRIORITY_VARIANT: Record<string, "default" | "info" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const { projectId, taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
      subtasks: {
        orderBy: { order: "asc" },
        include: {
          assignees: { include: { user: { select: { id: true, name: true } } } },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
      project: { select: { id: true, name: true } },
      subProject: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!task) notFound();

  const projectMembers = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { id: true, name: true } } },
  });

  const subProjects = await prisma.subProject.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/tasks" className="hover:text-blue-600">Tasks</Link>
        <span>/</span>
        <Link href={`/tasks/projects/${projectId}`} className="hover:text-blue-600">{task.project.name}</Link>
        <span>/</span>
        <span className="text-gray-900">{task.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 min-w-0 mr-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{task.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>{task.status.replace("_", " ")}</Badge>
            <Badge variant={PRIORITY_VARIANT[task.priority] ?? "default"}>{task.priority}</Badge>
            {task.subProject && <Badge variant="default">{task.subProject.name}</Badge>}
            {task.dueDate && (
              <span className={`text-xs ${new Date(task.dueDate) < new Date() && task.status !== "DONE" ? "text-red-600" : "text-gray-500"}`}>
                Due {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <TaskDetailActions
          taskId={taskId}
          projectId={projectId}
          currentStatus={task.status}
          currentPriority={task.priority}
          currentDueDate={task.dueDate?.toISOString().split("T")[0] ?? ""}
          currentSubProjectId={task.subProjectId ?? ""}
          currentAssigneeIds={task.assignees.map((a) => a.user.id)}
          members={projectMembers.map((m) => m.user)}
          subProjects={subProjects}
          currentUserId={session!.user.id}
        />
      </div>

      {task.description && (
        <Card className="mb-6">
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Subtasks ({task.subtasks.length})</h2>
                <Link
                  href={`/tasks/projects/${projectId}/tasks/new?parentTaskId=${taskId}`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Add subtask
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {task.subtasks.length === 0 ? (
                <p className="text-sm text-gray-500">No subtasks yet.</p>
              ) : (
                <div className="space-y-2">
                  {task.subtasks.map((subtask) => (
                    <Link
                      key={subtask.id}
                      href={`/tasks/projects/${projectId}/tasks/${subtask.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${subtask.status === "DONE" ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className={`text-sm flex-1 ${subtask.status === "DONE" ? "line-through text-gray-400" : "text-gray-900"}`}>
                        {subtask.title}
                      </span>
                      {subtask.assignees.length > 0 && (
                        <span className="text-xs text-gray-400">{subtask.assignees[0].user.name}</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-base font-semibold text-gray-900">Details</h2></CardHeader>
            <CardContent className="pt-0 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created by</span>
                <span className="text-gray-900">{task.createdBy.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Assignees</span>
                <span className="text-gray-900">
                  {task.assignees.length > 0
                    ? task.assignees.map((a) => a.user.name).join(", ")
                    : "Unassigned"}
                </span>
              </div>
              {task.subProject && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Sub-project</span>
                  <span className="text-gray-900">{task.subProject.name}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><h2 className="text-base font-semibold text-gray-900">Comments ({task.comments.length})</h2></CardHeader>
          <CardContent className="pt-0">
            <CommentThread taskId={taskId} comments={task.comments} currentUserId={session!.user.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CommentThread({
  taskId,
  comments,
  currentUserId,
}: {
  taskId: string;
  comments: { id: string; content: string; createdAt: Date; user: { id: string; name: string } }[];
  currentUserId: string;
}) {
  return (
    <div>
      {comments.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No comments yet.</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 shrink-0">
                {comment.user.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-900">{comment.user.name}</span>
                  <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <AddCommentForm taskId={taskId} />
    </div>
  );
}

// We need client components for interactivity, so extract them
import { AddCommentForm } from "./AddCommentForm";
