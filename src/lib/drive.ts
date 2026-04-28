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
 * signers complete it. The two states differ only in the `reason` text.
 *
 * Strategy: the file is signed if it's read-only AND the reason text does NOT
 * match a known in-progress phrase. This is permissive (anything read-only
 * that isn't explicitly mid-signing counts as final), but it matches reality:
 * almost every read-only state on a Drive file IS terminal (signed, "marked
 * as final", approved). The one common transient state is eSignature's
 * "currently being signed" lock, which we explicitly reject.
 *
 * Every check logs the reason so we can broaden IN_PROGRESS_PATTERN if a new
 * in-progress phrase appears. Returns false in stub mode; rethrows on API errors.
 */
type DriveRestriction = {
  readOnly?: boolean | null;
  reason?: string | null;
  restrictingUser?: {
    displayName?: string | null;
    emailAddress?: string | null;
  } | null;
};

// Phrases Drive uses while an eSignature request is sent but not yet finished.
// Anything matched here is treated as NOT signed.
const IN_PROGRESS_PATTERN =
  /being signed|in progress|currently being|awaiting signature|awaiting signer|pending signature|sent for signature|in review|waiting for signer/i;

function isFinalizedSignatureRestriction(r: DriveRestriction): boolean {
  if (r.readOnly !== true) return false;
  const reason = r.reason ?? "";
  // No reason at all → assume terminal lock (signed / mark-as-final). We treat
  // the absence of an in-progress phrase as the positive signal because Drive
  // doesn't always populate `reason` with completion text.
  if (IN_PROGRESS_PATTERN.test(reason)) return false;
  return true;
}

export async function isFileSigned(fileId: string): Promise<boolean> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return false;

  const res = await drive.files.get({
    fileId,
    fields:
      "contentRestrictions(readOnly,reason,restrictingUser(displayName,emailAddress))",
    supportsAllDrives: true,
  });

  const restrictions = (res.data.contentRestrictions ?? []) as DriveRestriction[];
  const finalized = restrictions.some(isFinalizedSignatureRestriction);

  // Always log the raw restriction data when readOnly is set — invaluable for
  // tuning IN_PROGRESS_PATTERN against real Drive responses.
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
