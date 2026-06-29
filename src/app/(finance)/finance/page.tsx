import { redirect } from "next/navigation";

export default async function FinanceRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; week?: string }>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();

  if (params.year) next.set("year", params.year);
  if (params.week) next.set("week", params.week);

  const query = next.toString();
  redirect(query ? `/finance/profit-loss?${query}` : "/finance/profit-loss");
}
