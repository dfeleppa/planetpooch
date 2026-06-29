import { redirect } from "next/navigation";

type SearchParams = {
  business?: string;
  month?: string;
  year?: string;
};

export default async function FinanceAdReportingRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();

  if (params.business) next.set("business", params.business);
  if (params.month) next.set("month", params.month);
  if (params.year) next.set("year", params.year);

  const query = next.toString();
  redirect(query ? `/marketing/ad-reporting?${query}` : "/marketing/ad-reporting");
}
