import { requireAuth } from "@/lib/auth-helpers";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  await requireAuth();
  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
        <p className="text-gray-500 mt-1">Create a project to organize tasks for your team</p>
      </div>
      <NewProjectForm />
    </div>
  );
}
