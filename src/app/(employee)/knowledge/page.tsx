import { requireAuth } from "@/lib/auth-helpers";
import { KnowledgeChat } from "@/components/knowledge/KnowledgeChat";
import { getKnowledgeViewer } from "@/lib/knowledge";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { hasAskPoochAccess } from "@/lib/knowledge-access";
import { notFound } from "next/navigation";

export default async function KnowledgePage() {
  const session = await requireAuth();
  const viewer = await getKnowledgeViewer(session.user.id);
  if (!viewer || !hasAskPoochAccess(viewer)) notFound();
  return <KnowledgeChat owner={isKnowledgeOwner(viewer)} />;
}
