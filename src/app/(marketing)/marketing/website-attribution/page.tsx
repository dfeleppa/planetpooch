import { redirect } from "next/navigation";

type PageProps = { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string }> };

export default async function WebsiteAttributionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.submissionStart) query.set("submissionStart", params.submissionStart);
  if (params.submissionEnd) query.set("submissionEnd", params.submissionEnd);
  redirect(`/marketing/website-attribution/new-form-submissions${query.size ? `?${query}` : ""}`);
}
