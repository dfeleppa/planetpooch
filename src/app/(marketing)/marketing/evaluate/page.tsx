import { redirect } from "next/navigation";

export default async function EvaluateAdsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["month", "year", "range", "source", "days", "campaign", "sort", "dir"]) {
    if (query[key]) params.set(key, query[key]);
  }
  if (query.view === "creatives") params.set("view", "creatives");
  const suffix = params.toString();
  redirect(`/marketing/ad-reporting${suffix ? `?${suffix}` : ""}`);
}
