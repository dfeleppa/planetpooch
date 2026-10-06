import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AnonymousGetStartedVisitsPage() {
  redirect("/marketing?view=submissions");
}
