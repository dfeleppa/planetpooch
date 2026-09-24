export const KNOWLEDGE_OWNER_EMAIL = "dfeleppa@gmail.com";

export function isKnowledgeOwner(user: { email?: string | null; role?: string | null }): boolean {
  return user.email?.trim().toLowerCase() === KNOWLEDGE_OWNER_EMAIL &&
    (user.role === "SUPER_ADMIN" || user.role === "ADMIN");
}
