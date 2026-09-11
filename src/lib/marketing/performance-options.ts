/** Shared with client-side filters; keep database and request APIs out of this module. */
export const DAY_PRESETS = [7, 30, 90] as const;
export type DayPreset = (typeof DAY_PRESETS)[number];
