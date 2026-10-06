import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdReportingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
  }
  redirect(params.size ? `/marketing?${params}` : "/marketing");
}
