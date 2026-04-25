/**
 * Google API client factory.
 *
 * Auth strategy: Workload Identity Federation (WIF) on Vercel.
 * Vercel issues a short-lived OIDC token per invocation; Google's STS exchanges
 * it for an access token scoped to the `portal-storage` service account, which
 * has access to the Shared Drive.
 *
 * On Fluid Compute the token is delivered as the `x-vercel-oidc-token` request
 * header (not `process.env.VERCEL_OIDC_TOKEN`) — `@vercel/oidc` reads from the
 * request context and falls back to the env var on non-Fluid runtimes.
 *
 * Local dev: if the WIF env vars aren't set, `isDriveEnabled()` returns false
 * and callers fall back to stub behavior (no real Drive calls, fake IDs). Real
 * Drive only runs on Vercel.
 */
import { ExternalAccountClient } from "google-auth-library";
import { google, drive_v3 } from "googleapis";
import { getVercelOidcToken } from "@vercel/oidc";

type Env = {
  projectNumber: string;
  poolId: string;
  providerId: string;
  serviceAccountEmail: string;
};

function readEnv(): Env | null {
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_PROVIDER_ID;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (!projectNumber || !poolId || !providerId || !serviceAccountEmail) {
    return null;
  }
  return { projectNumber, poolId, providerId, serviceAccountEmail };
}

/**
 * True when every WIF static config var is present. The OIDC token itself is
 * request-scoped on Fluid Compute, so we do NOT check it here — it's fetched
 * inside `subject_token_supplier` at the moment of each STS exchange.
 */
export function isDriveEnabled(): boolean {
  const env = readEnv();
  if (env) return true;
  const missing: string[] = [];
  if (!process.env.GCP_PROJECT_NUMBER) missing.push("GCP_PROJECT_NUMBER");
  if (!process.env.GCP_WORKLOAD_IDENTITY_POOL_ID) missing.push("GCP_WORKLOAD_IDENTITY_POOL_ID");
  if (!process.env.GCP_WORKLOAD_IDENTITY_PROVIDER_ID) missing.push("GCP_WORKLOAD_IDENTITY_PROVIDER_ID");
  if (!process.env.GCP_SERVICE_ACCOUNT_EMAIL) missing.push("GCP_SERVICE_ACCOUNT_EMAIL");
  console.warn("[drive] Drive disabled — missing env vars:", missing.join(", "));
  return false;
}

let cachedDrive: drive_v3.Drive | null = null;

/**
 * Returns an authenticated Drive v3 client, or null if WIF env isn't configured
 * (local dev / missing secrets). Cached across invocations within the same
 * serverless function instance.
 */
export function getDriveClient(): drive_v3.Drive | null {
  if (cachedDrive) return cachedDrive;
  const env = readEnv();
  if (!env) return null;

  const audience = `//iam.googleapis.com/projects/${env.projectNumber}/locations/global/workloadIdentityPools/${env.poolId}/providers/${env.providerId}`;

  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken(),
    },
  });

  if (!authClient) {
    throw new Error("Failed to construct ExternalAccountClient — check GCP_* env vars");
  }

  authClient.scopes = ["https://www.googleapis.com/auth/drive"];

  cachedDrive = google.drive({ version: "v3", auth: authClient });
  return cachedDrive;
}

export function getSharedDriveId(): string | undefined {
  return process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;
}

export function getRootFolderId(): string | undefined {
  return process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
}
