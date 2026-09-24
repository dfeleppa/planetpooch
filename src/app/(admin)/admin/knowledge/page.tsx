import { requireSuperAdmin } from "@/lib/auth-helpers";
import { KnowledgeEditor } from "@/components/knowledge/KnowledgeEditor";
import { getKnowledgeViewer } from "@/lib/knowledge";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { notFound } from "next/navigation";

export default async function KnowledgeAdminPage() {
  const session = await requireSuperAdmin();
  const viewer = await getKnowledgeViewer(session.user.id);
  if (!viewer || !isKnowledgeOwner(viewer)) notFound();
  return <KnowledgeEditor />;
}
