import { WebsiteAttributionReport } from "../Report";

export const dynamic = "force-dynamic";

export default async function AnonymousGetStartedVisitsPage() {
  return <WebsiteAttributionReport searchParams={Promise.resolve({})} showVisits />;
}
