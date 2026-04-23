import { requireAdmin } from "@/lib/auth-helpers";
import { TemplateEditor } from "./TemplateEditor";

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  await requireAdmin();
  const { templateId } = await params;
  return <TemplateEditor templateId={templateId} />;
}
