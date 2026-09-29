import type { WebsiteFormSubmissionRow } from "./new-client-submissions";

export type MoegoClientProfile = {
  moegoId: string;
  name: string | null;
  mainPhoneNumber: string | null;
  createdTime: Date;
};

export type MoegoClientHistory = {
  status: "existing" | "recent" | "created_after" | "no_match" | "no_phone" | "unavailable";
  profiles: MoegoClientProfile[];
  oldestPriorProfile: MoegoClientProfile | null;
};

export type SubmissionWithClientHistory = WebsiteFormSubmissionRow & {
  clientHistory: MoegoClientHistory;
};

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function normalizedPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Match exact last-ten-digit phone numbers, including duplicate MoeGo profiles. */
export function classifyMoegoClientHistory(
  phone: string | null,
  receivedAt: Date,
  matchingProfiles: MoegoClientProfile[],
): MoegoClientHistory {
  if (!normalizedPhone(phone)) {
    return { status: "no_phone", profiles: [], oldestPriorProfile: null };
  }

  const profiles = [...matchingProfiles].sort((a, b) =>
    a.createdTime.getTime() - b.createdTime.getTime() || a.moegoId.localeCompare(b.moegoId),
  );
  const priorProfiles = profiles.filter((profile) => profile.createdTime <= receivedAt);
  const oldestPriorProfile = priorProfiles[0] ?? null;
  const status = oldestPriorProfile && oldestPriorProfile.createdTime.getTime() < receivedAt.getTime() - NINETY_DAYS_MS
    ? "existing"
    : oldestPriorProfile ? "recent" : profiles.length ? "created_after" : "no_match";

  return { status, profiles, oldestPriorProfile };
}
