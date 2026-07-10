import { redirect } from "next/navigation";

export default function UnlinkedAdsPage() {
  redirect("/marketing/evaluate?view=creatives&link=unlinked");
}
