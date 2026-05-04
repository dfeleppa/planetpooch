import { requireAdmin } from "@/lib/auth-helpers";
import { NewTemplateForm } from "./NewTemplateForm";
import Link from "next/link";

export default async function NewTemplatePage() {
  await requireAdmin();

  return (
    <div className="w-full">
      <div className="mb-6">
        <Link
          href="/admin/onboarding/templates"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to templates
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Template</h1>
        <p className="text-gray-500 mt-1">
          Name your template now. You&apos;ll add and reorder tasks on the next
          screen.
        </p>
      </div>
      <NewTemplateForm />
    </div>
  );
}
