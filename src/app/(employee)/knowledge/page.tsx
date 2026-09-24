import { requireAuth } from "@/lib/auth-helpers";
import { KnowledgeChat } from "@/components/knowledge/KnowledgeChat";

export default async function KnowledgePage() {
  await requireAuth();
  return <KnowledgeChat />;
}
