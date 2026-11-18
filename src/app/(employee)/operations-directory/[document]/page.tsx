import { redirect } from "next/navigation";
import { downtimeLists } from "@/lib/downtime";
import Directory from "../Directory";

export default async function CategoryPage({ params }: PageProps<"/operations-directory/[document]">) {
  const { document } = await params;
  const downtime = downtimeLists.find(item => item.slug === document);
  if (downtime) redirect(downtime.href + "?company=RESORT");
  return <Directory slug={document} />;
}
