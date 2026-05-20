/**
 * Thin Drive wrappers for the onboarding flow.
 *
 * Every function degrades gracefully when WIF isn't configured: it returns a
 * stub value (fake folder/file ID) so local dev + missing-secret environments
 * keep working. Callers don't need to branch — `isDriveEnabled()` is only
 * exposed for UI hints ("Drive folder" link vs "Drive disabled" badge).
 */
import { Readable } from "node:stream";
import { Company } from "@prisma/client";
import {
  getDriveClient,
  getSharedDriveId,
  isDriveEnabled,
} from "./google";

export { isDriveEnabled };

const FOLDER_MIME = "application/vnd.google-apps.folder";
const STUB_PREFIX = "stub-";

export function isStubId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(STUB_PREFIX);
}

// Direct mapping from company to its Shared Drive folder ID. Each company has
// its own dedicated subfolder; new employee folders are created as children of
// the matching ID. Update here if a company's parent folder is moved or renamed.
const COMPANY_FOLDER_ID: Record<Company, string> = {
  GROOMING: "13jDVIp6W8Eg9s01wsN4FfYFmmQusQIh4",
  RESORT: "1q7gZCjC8tzpA9dkExrqnMLqOYZawmcgK",
  CORPORATE: "18AqhTNDuHUkWaM7kNiZqQzx2u-lY50EC",
};

/**
 * Create an employee folder named `folderName` (e.g. "Smith, Jane") inside the
 * company's dedicated parent folder in the Shared Drive. Returns the folder's
 * Drive file ID. In stub mode, returns `stub-folder-<rand>`.
 */
export async function createEmployeeFolder(
  folderName: string,
  company: Company
): Promise<string> {
  const drive = getDriveClient();
  const sharedDriveId = getSharedDriveId();

  if (!drive || !sharedDriveId) {
    return `${STUB_PREFIX}folder-${Math.random().toString(36).slice(2, 10)}`;
  }

  const parentId = COMPANY_FOLDER_ID[company];

  const res = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const id = res.data.id;
  if (!id) throw new Error("Drive returned no folder ID");
  return id;
}

/**
 * Upload a buffer to a folder. Used for admin file uploads (I-9, W-4, etc).
 * Returns the uploaded file's Drive ID.
 */
export async function uploadToFolder(
  folderId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const drive = getDriveClient();
  if (!drive || isStubId(folderId)) {
    return `${STUB_PREFIX}file-${Math.random().toString(36).slice(2, 10)}`;
  }

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
    supportsAllDrives: true,
  });

  const id = res.data.id;
  if (!id) throw new Error("Drive returned no file ID");
  return id;
}

/**
 * Extract a Drive file ID from either a raw ID or a Google URL.
 *
 * Accepts:
 *   - Raw ID: "1AbC...xyz"
 *   - drive.google.com/file/d/{ID}/...
 *   - drive.google.com/open?id={ID}
 *   - docs.google.com/{document,spreadsheets,presentation}/d/{ID}/...
 *
 * Returns null when the input doesn't match any of those shapes — caller is
 * expected to surface a 400.
 */
export function parseDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const dMatch = trimmed.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (dMatch) return dMatch[1];

  const idMatch = trimmed.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Verify a Drive file exists and is accessible to the service account. Used
 * when the admin pastes a link that we want to validate before persisting.
 *
 * Returns true on success, false if the file doesn't exist / isn't shared.
 * In stub mode (no real Drive) returns true so local dev keeps working.
 */
export async function fileExists(fileId: string): Promise<boolean> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return true;

  try {
    await drive.files.get({
      fileId,
      fields: "id",
      supportsAllDrives: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a `webViewLink` (browser-openable Drive URL). Null in stub mode so
 * callers can hide the link.
 */
export async function getFileWebLink(fileId: string): Promise<string | null> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return null;

  const res = await drive.files.get({
    fileId,
    fields: "webViewLink",
    supportsAllDrives: true,
  });
  return res.data.webViewLink ?? null;
}

/**
 * Copy `sourceFileId` into `targetFolderId` with a new name. Used by the
 * eSignature flow to drop a per-employee copy of a master document
 * (e.g. handbook) into the employee's Drive folder. Returns the new file ID.
 * In stub mode, returns a fake ID so the rest of the flow proceeds.
 */
export async function copyFileToFolder(
  sourceFileId: string,
  targetFolderId: string,
  newName: string
): Promise<string> {
  const drive = getDriveClient();
  if (!drive || isStubId(sourceFileId) || isStubId(targetFolderId)) {
    return `${STUB_PREFIX}file-${Math.random().toString(36).slice(2, 10)}`;
  }

  const res = await drive.files.copy({
    fileId: sourceFileId,
    requestBody: { name: newName, parents: [targetFolderId] },
    fields: "id",
    supportsAllDrives: true,
  });

  const id = res.data.id;
  if (!id) throw new Error("Drive returned no file ID for copy");
  return id;
}

/**
 * Check whether a Drive file has been finalized by Google Workspace eSignature.
 *
 * Drive applies `contentRestrictions[].readOnly: true` BOTH when an eSignature
 * request is sent (locking the file while signers review) AND when all
 * signers complete it.
 *
 * Strategy: use the `systemRestricted` field to identify eSignature-applied
 * restrictions (only eSignature sets this). For system restrictions, use a
 * denylist — treat as signed unless the reason matches a known in-progress
 * phrase. For non-system restrictions (manual locks), use an allowlist — only
 * treat as signed if the reason explicitly says so.
 *
 * This avoids both false positives (manual read-only locks ≠ signed) and false
 * negatives (unknown eSignature completion reason text still detected).
 */
type DriveRestriction = {
  readOnly?: boolean | null;
  reason?: string | null;
  systemRestricted?: boolean | null;
  restrictingUser?: {
    displayName?: string | null;
    emailAddress?: string | null;
  } | null;
};

// Phrases Drive uses while an eSignature request is still in progress.
const IN_PROGRESS_PATTERN =
  /being signed|in progress|currently being|awaiting signature|awaiting signer|pending signature|sent for signature|in review|waiting for signer/i;

// Phrases that indicate a non-system restriction is a completed signature.
const SIGNED_PATTERN =
  /signed|completed|finalized|executed|all parties/i;

function isFinalizedSignatureRestriction(r: DriveRestriction): boolean {
  if (r.readOnly !== true) return false;

  const reason = r.reason ?? "";

  // System-restricted = applied by eSignature. Signed unless explicitly in-progress.
  if (r.systemRestricted === true) {
    return !IN_PROGRESS_PATTERN.test(reason);
  }

  // Non-system restriction: only count as signed with an explicit completion phrase.
  if (!reason) return false;
  return SIGNED_PATTERN.test(reason);
}

export async function isFileSigned(fileId: string): Promise<boolean> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return false;

  const res = await drive.files.get({
    fileId,
    fields:
      "contentRestrictions(readOnly,reason,systemRestricted,restrictingUser(displayName,emailAddress))",
    supportsAllDrives: true,
  });

  const restrictions = (res.data.contentRestrictions ?? []) as DriveRestriction[];
  const finalized = restrictions.some(isFinalizedSignatureRestriction);

  if (restrictions.some((r) => r.readOnly === true)) {
    console.info("[drive.isFileSigned]", {
      fileId,
      finalized,
      restrictions,
    });
  }

  return finalized;
}

/**
 * Delete a Drive file. No-op in stub mode (no real Drive). Errors propagate
 * so user-initiated deletions can surface failures — wrap with try/catch in
 * cleanup paths where you want best-effort behavior.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return;

  await drive.files.delete({ fileId, supportsAllDrives: true });
}
