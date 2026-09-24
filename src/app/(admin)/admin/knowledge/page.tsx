import { requireSuperAdmin } from "@/lib/auth-helpers";
import { KnowledgeEditor } from "@/components/knowledge/KnowledgeEditor";

export default async function KnowledgeAdminPage() {
  await requireSuperAdmin();
  return <KnowledgeEditor />;
}
