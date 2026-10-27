import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-helpers";
import { homePageFor } from "@/lib/home-page";

export default async function Home() {
  const session = await getSession();
  if (session?.user) {
    redirect(homePageFor(session.user));
  }
  redirect("/login");
}
