export const KNOWLEDGE_OWNER_EMAILS = new Set([
  "dfeleppa@gmail.com",
  "agonzaga91@gmail.com",
]);

export function isKnowledgeOwner(user: { email?: string | null; role?: string | null }): boolean {
  return KNOWLEDGE_OWNER_EMAILS.has(user.email?.trim().toLowerCase() ?? "") &&
    (user.role === "SUPER_ADMIN" || user.role === "ADMIN");
}
