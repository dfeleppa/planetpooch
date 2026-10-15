import { redirect } from "next/navigation";

export default async function WebsiteAttributionPage({ searchParams }: { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string }> }) {
  const params = await searchParams;
  const dates = params.submissionStart && params.submissionEnd
    ? `?from=${encodeURIComponent(params.submissionStart)}&to=${encodeURIComponent(params.submissionEnd)}` : "";
  redirect(`/marketing${dates}`);
}
