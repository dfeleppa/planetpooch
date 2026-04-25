import { NextResponse } from "next/server";
import { getVercelOidcToken } from "@vercel/oidc";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { isDriveEnabled, getDriveClient, getSharedDriveId, getRootFolderId } from "@/lib/google";

/**
 * Temporary Phase 3 debug endpoint. Shows which WIF env vars are present and
 * attempts a live Drive API call (list of 1 file in the root folder). Delete
 * this file once Drive is working.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const envPresence = {
    GCP_PROJECT_NUMBER: !!process.env.GCP_PROJECT_NUMBER,
    GCP_WORKLOAD_IDENTITY_POOL_ID: !!process.env.GCP_WORKLOAD_IDENTITY_POOL_ID,
    GCP_WORKLOAD_IDENTITY_PROVIDER_ID: !!process.env.GCP_WORKLOAD_IDENTITY_PROVIDER_ID,
    GCP_SERVICE_ACCOUNT_EMAIL: !!process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_DRIVE_SHARED_DRIVE_ID: !!process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  };

  // On Fluid Compute the OIDC token is delivered as the `x-vercel-oidc-token`
  // request header, not via process.env. Probe via @vercel/oidc, which reads
  // from the request context and falls back to the env var on non-Fluid.
  let oidc: { available: boolean; length: number; error?: string };
  try {
    const token = await getVercelOidcToken();
    oidc = { available: !!token, length: token?.length ?? 0 };
  } catch (err) {
    oidc = {
      available: false,
      length: 0,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  // All VERCEL_* system vars present in this invocation (names only, no values).
  const vercelEnvKeys = Object.keys(process.env).filter((k) => k.startsWith("VERCEL_"));

  // Non-sensitive deployment context — tells us which deployment actually served
  // this request, so we can reconcile against the Vercel dashboard.
  const deployment = {
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    VERCEL_TARGET_ENV: process.env.VERCEL_TARGET_ENV ?? null,
    VERCEL_URL: process.env.VERCEL_URL ?? null,
    VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    VERCEL_GIT_PULL_REQUEST_ID: process.env.VERCEL_GIT_PULL_REQUEST_ID ?? null,
    VERCEL_REGION: process.env.VERCEL_REGION ?? null,
  };

  const enabled = isDriveEnabled();

  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      envPresence,
      oidc,
      deployment,
      vercelEnvKeys,
      message: "isDriveEnabled() returned false — at least one required env var is missing.",
    });
  }

  // Try a live Drive call to prove WIF is working.
  try {
    const drive = getDriveClient();
    if (!drive) throw new Error("getDriveClient returned null despite isDriveEnabled true");
    const res = await drive.files.list({
      q: `'${getRootFolderId()}' in parents and trashed = false`,
      pageSize: 5,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      driveId: getSharedDriveId(),
      corpora: "drive",
    });
    return NextResponse.json({
      enabled: true,
      envPresence,
      oidc,
      deployment,
      driveCall: "success",
      files: res.data.files ?? [],
    });
  } catch (err) {
    return NextResponse.json({
      enabled: true,
      envPresence,
      oidc,
      deployment,
      driveCall: "error",
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
}
