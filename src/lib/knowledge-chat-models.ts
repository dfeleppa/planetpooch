export const KNOWLEDGE_CHAT_MODEL_IDS = ["gpt-6-luna", "gpt-6.1-sol"] as const;
export type KnowledgeChatModel = (typeof KNOWLEDGE_CHAT_MODEL_IDS)[number];
export const DEFAULT_KNOWLEDGE_CHAT_MODEL: KnowledgeChatModel = "gpt-6-luna";

export const KNOWLEDGE_CHAT_MODEL_CONFIG: Record<KnowledgeChatModel, {
  label: string;
  reasoningEffort: "none" | "low";
  maxOutputTokens: number;
}> = {
  "gpt-6-luna": { label: "GPT-6 Luna · Faster", reasoningEffort: "none", maxOutputTokens: 700 },
  "gpt-6.1-sol": { label: "GPT-6.1 Sol · Stronger", reasoningEffort: "low", maxOutputTokens: 1600 },
};
