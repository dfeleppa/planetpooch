import type { HookStatus, Platform, ScriptStatus } from "@prisma/client";

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
