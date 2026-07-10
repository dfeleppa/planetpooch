import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { NewIdeaForm } from "./NewIdeaForm";

export default async function NewIdeaPage() {
  await requireMarketing();
  return (
    <div className="w-full">
      <div className="mb-4">
        <Link
          href="/marketing/create"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Create Ads
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">New ad brief</h1>
      <p className="text-gray-500 mb-6">
        Define the customer truth once, then generate copy-ready Meta and Google assets.
      </p>
      <NewIdeaForm />
    </div>
  );
}
