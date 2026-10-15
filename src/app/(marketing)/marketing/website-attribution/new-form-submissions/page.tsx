import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewFormSubmissionsPage({ searchParams }: { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string }> }) {
  const params = await searchParams;
  const dates = params.submissionStart && params.submissionEnd
    ? `?from=${encodeURIComponent(params.submissionStart)}&to=${encodeURIComponent(params.submissionEnd)}` : "";
  redirect(`/marketing${dates}`);
}
