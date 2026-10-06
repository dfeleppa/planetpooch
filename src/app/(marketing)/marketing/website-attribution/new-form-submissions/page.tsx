import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string; page?: string }> };

export default async function NewFormSubmissionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: "submissions" });
  if (params.submissionStart) query.set("submissionStart", params.submissionStart);
  if (params.submissionEnd) query.set("submissionEnd", params.submissionEnd);
  if (params.page) query.set("page", params.page);
  redirect(`/marketing?${query}`);
}
