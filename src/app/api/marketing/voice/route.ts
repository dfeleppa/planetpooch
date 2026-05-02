import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { SaveVoiceProfileSchema } from "@/lib/validators/marketing";
import {
  getLatestVoiceProfile,
  saveNewVoiceProfileVersion,
} from "@/lib/marketing/voice";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getLatestVoiceProfile();
  return NextResponse.json(profile);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await validateBody(req, SaveVoiceProfileSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const profile = await saveNewVoiceProfileVersion(
      parsed.data,
      (session.user as { id: string }).id
    );
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save voice profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
