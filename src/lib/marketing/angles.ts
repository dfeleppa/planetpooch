import type { AngleStatus, EmotionalRegister } from "@prisma/client";

export const EMOTIONAL_REGISTERS: EmotionalRegister[] = [
  "FEAR",
  "ASPIRATION",
  "HUMOR",
  "LOGIC",
  "PRIDE",
  "CURIOSITY",
  "NOSTALGIA",
  "COMMUNITY",
];

export const EMOTIONAL_REGISTER_LABELS: Record<EmotionalRegister, string> = {
  FEAR: "Fear",
  ASPIRATION: "Aspiration",
  HUMOR: "Humor",
  LOGIC: "Logic",
  PRIDE: "Pride",
  CURIOSITY: "Curiosity",
  NOSTALGIA: "Nostalgia",
  COMMUNITY: "Community",
};

export const ANGLE_STATUS_LABELS: Record<AngleStatus, string> = {
  DRAFT: "Draft",
  SELECTED: "Selected",
  GENERATED: "Script generated",
  DISCARDED: "Discarded",
};

export const ANGLE_STATUS_VARIANT: Record<
  AngleStatus,
  "default" | "info" | "success" | "warning"
> = {
  DRAFT: "default",
  SELECTED: "info",
  GENERATED: "success",
  DISCARDED: "default",
};

/**
 * Suggested visual treatments — surfaced in the angle review UI as
 * datalist hints. Free text in the DB so the model isn't trapped in a
 * fixed taxonomy, but the common cases get autocomplete.
 */
export const VISUAL_TREATMENT_SUGGESTIONS = [
  "UGC talking head",
  "cinematic",
  "split-screen",
  "static",
  "demo",
  "b-roll montage",
];
