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

function isStubId(id: string | null | undefined): boolean {
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
 * Best-effort delete. Swallows errors — we don't want a failed Drive call to
 * block a Prisma delete.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return;

  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (err) {
    console.warn("[drive] deleteFile failed for", fileId, err);
  }
}
