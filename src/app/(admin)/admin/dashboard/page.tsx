import type { Metadata } from "next";
import { getAdminDashboard } from "@/lib/admin-dashboard";
import { DashboardView } from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard | Planet Pooch" };

export default async function DashboardPage() {
  return <DashboardView data={await getAdminDashboard()} />;
}
