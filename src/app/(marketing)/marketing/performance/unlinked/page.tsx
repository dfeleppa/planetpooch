import { redirect } from "next/navigation";

export default function UnlinkedAdsPage() {
  redirect("/marketing/ad-reporting?view=creatives");
}
