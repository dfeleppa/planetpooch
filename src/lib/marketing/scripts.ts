import type { HookStatus, Platform, ScriptStatus } from "@prisma/client";
import type { ScriptModel } from "@/lib/validators/marketing";

export const SCRIPT_MODELS: ScriptModel[] = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

export const SCRIPT_MODEL_LABELS: Record<ScriptModel, string> = {
  "claude-haiku-4-5": "Haiku 4.5 — fastest, lowest cost",
  "claude-sonnet-4-6": "Sonnet 4.6 — balanced",
  "claude-opus-4-7": "Opus 4.7 — highest quality, slowest",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  REELS: "Instagram Reels",
  TIKTOK: "TikTok",
  YT_SHORTS: "YouTube Shorts",
  META_FEED: "Meta feed",
  FB_FEED: "Facebook feed",
  MULTI: "Multi-platform",
};

export const SCRIPT_STATUS_LABELS: Record<ScriptStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  FILMED: "Filmed",
  POSTED: "Posted",
  ARCHIVED: "Archived",
};

export const SCRIPT_STATUS_VARIANT: Record<
  ScriptStatus,
  "default" | "info" | "success" | "warning"
> = {
  DRAFT: "default",
  APPROVED: "info",
  FILMED: "warning",
  POSTED: "success",
  ARCHIVED: "default",
};

export const HOOK_STATUS_LABELS: Record<HookStatus, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WINNER: "Winner",
};

export const HOOK_STATUS_VARIANT: Record<
  HookStatus,
  "default" | "info" | "success" | "warning" | "danger"
> = {
  DRAFT: "default",
  APPROVED: "info",
  REJECTED: "danger",
  WINNER: "success",
};
