import { WebsiteAttributionReport } from "../Report";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string; page?: string }> };

export default function NewFormSubmissionsPage({ searchParams }: PageProps) {
  return <WebsiteAttributionReport searchParams={searchParams} showVisits={false} />;
}
