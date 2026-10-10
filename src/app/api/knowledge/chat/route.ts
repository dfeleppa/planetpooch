import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-helpers";
import { isBusinessSwitchOriginAllowed } from "@/lib/business";
import { findKnowledgeSources, getKnowledgeViewer } from "@/lib/knowledge";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { knowledgeRetrievalQuestion } from "@/lib/knowledge-app-data";
import { DEFAULT_KNOWLEDGE_CHAT_MODEL, KNOWLEDGE_CHAT_MODEL_IDS } from "@/lib/knowledge-chat-models";
import { buildKnowledgeAnswerRequest, knowledgeResponseText, type KnowledgeModelResponse } from "@/lib/knowledge-answer-request";

export const runtime = "nodejs";

const requestSchema = z.object({
  model: z.enum(KNOWLEDGE_CHAT_MODEL_IDS).default(DEFAULT_KNOWLEDGE_CHAT_MODEL),
  messages: z.array(z.discriminatedUnion("role", [
    z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(2000) }),
    // Generated analyses are longer than the question box's input limit.
    z.object({ role: z.literal("assistant"), content: z.string().trim().min(1).max(16000) }),
  ])).min(1).max(9),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isBusinessSwitchOriginAllowed(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Enter a question to continue." }, { status: 400 });
  }
  const viewer = await getKnowledgeViewer(session.user.id);
  if (!viewer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isKnowledgeOwner(viewer)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const messages = parsed.data.messages;
  const model = parsed.data.model;
  const question = messages[messages.length - 1].content;
  const retrievalQuestion = knowledgeRetrievalQuestion(messages);
  let sources: Awaited<ReturnType<typeof findKnowledgeSources>>;
  try {
    sources = await findKnowledgeSources(viewer, retrievalQuestion);
  } catch (error) {
    console.error("[knowledge.chat] Source lookup failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The knowledge sources are unavailable right now." }, { status: 502 });
  }
  if (sources.length === 0) {
    return NextResponse.json({
      answer: "I couldn’t find a reliable Planet Pooch source for that yet. Please ask a manager or try a more specific question.",
      sources: [],
      reportPlan: null,
      retrievalPath: "none",
    });
  }

  const key = process.env.openai || process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "The assistant is not configured yet." }, { status: 503 });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildKnowledgeAnswerRequest(question, messages, sources, model)),
      cache: "no-store",
      signal: AbortSignal.timeout(model === "gpt-6.1-sol" ? 45000 : 25000),
    });
    if (!response.ok) {
      console.error("[knowledge.chat] OpenAI request failed", response.status);
      return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
    }
    const answer = knowledgeResponseText(await response.json() as KnowledgeModelResponse);
    if (!answer) return NextResponse.json({ error: "The assistant returned no answer." }, { status: 502 });
    return NextResponse.json({ answer, sources: sources.map(({ id, title, kind, url }) => ({ id, title, kind, url })),
      reportPlan: sources[0]?.reportPlan ?? null, retrievalPath: sources[0]?.retrievalPath ?? "unknown" });
  } catch (error) {
    console.error("[knowledge.chat] Request failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
