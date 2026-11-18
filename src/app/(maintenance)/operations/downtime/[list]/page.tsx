import { notFound } from "next/navigation";
import Directory from "@/app/(employee)/operations-directory/Directory";
import { downtimeLists } from "@/lib/downtime";

export default async function DowntimePage({ params }: PageProps<"/operations/downtime/[list]">) {
  const { list } = await params;
  const item = downtimeLists.find(item => item.href === "/operations/downtime/" + list);
  if (!item) notFound();
  return <Directory slug={item.slug} />;
}
