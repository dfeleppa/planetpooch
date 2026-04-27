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
  getRootFolderId,
  isDriveEnabled,
} from "./google";

export { isDriveEnabled };

const FOLDER_MIME = "application/vnd.google-apps.folder";
const STUB_PREFIX = "stub-";

function isStubId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(STUB_PREFIX);
}

const COMPANY_SUBFOLDER: Record<Company, string> = {
  GROOMING: "Grooming",
  RESORT: "Resort",
  CORPORATE: "Corporate",
};

// Cache resolved subfolder IDs for the lifetime of the function instance to
// avoid one Drive lookup per employee creation.
const subfolderIdCache = new Map<string, string>();

/**
 * Find a child folder by name within `parentFolderId`. Returns the folder ID,
 * or null if no match. Used to route new employee folders into Grooming /
 * Resort / Corporate subfolders without requiring three additional env vars.
 */
async function findSubfolderByName(
  parentFolderId: string,
  name: string
): Promise<string | null> {
  const cacheKey = `${parentFolderId}::${name}`;
  const cached = subfolderIdCache.get(cacheKey);
  if (cached) return cached;

  const drive = getDriveClient();
  const sharedDriveId = getSharedDriveId();
  if (!drive || !sharedDriveId) return null;

  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    driveId: sharedDriveId,
    corpora: "drive",
  });

  const id = res.data.files?.[0]?.id ?? null;
  if (id) subfolderIdCache.set(cacheKey, id);
  return id;
}

/**
 * Create an employee folder named `folderName` (e.g. "Smith, Jane") inside the
 * company subfolder ("Grooming" / "Resort" / "Corporate") within the root.
 * Falls back to creating directly under the root folder if the expected
 * subfolder doesn't exist (logged warning) — admin can move it manually.
 * Returns the folder's Drive file ID. In stub mode, returns `stub-folder-<rand>`.
 */
export async function createEmployeeFolder(
  folderName: string,
  company: Company
): Promise<string> {
  const drive = getDriveClient();
  const rootFolderId = getRootFolderId();
  const sharedDriveId = getSharedDriveId();

  if (!drive || !rootFolderId || !sharedDriveId) {
    return `${STUB_PREFIX}folder-${Math.random().toString(36).slice(2, 10)}`;
  }

  const subfolderName = COMPANY_SUBFOLDER[company];
  let parentId = await findSubfolderByName(rootFolderId, subfolderName);
  if (!parentId) {
    console.warn(
      `[drive] Subfolder "${subfolderName}" not found under root; creating "${folderName}" at root instead`
    );
    parentId = rootFolderId;
  }

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
 * Grant `email` writer access to `fileId` and trigger Drive's built-in email
 * notification. The recipient gets a "<doc> shared with you" email containing
 * a link to open the file in Drive, where they can use the native "Request
 * signature" / signing UI to sign. This is the v1 transport for eSign requests
 * — when we wire the real eSignature API it will replace this call.
 *
 * No-ops in stub mode.
 */
export async function shareFileWithUser(
  fileId: string,
  email: string,
  emailMessage?: string
): Promise<void> {
  const drive = getDriveClient();
  if (!drive || isStubId(fileId)) return;

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: "user",
      role: "writer",
      emailAddress: email,
    },
    sendNotificationEmail: true,
    emailMessage,
    supportsAllDrives: true,
  });
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
