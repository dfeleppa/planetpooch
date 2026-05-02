import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { NewIdeaForm } from "./NewIdeaForm";

export default async function NewIdeaPage() {
  await requireMarketing();
  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link
          href="/marketing/ideas"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to ideas
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">New Idea</h1>
      <p className="text-gray-500 mb-6">
        Capture the seed insight. Scripts and hooks will hang off this.
      </p>
      <NewIdeaForm />
    </div>
  );
}
