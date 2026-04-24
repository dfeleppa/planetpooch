/**
 * Thin Drive wrappers for the onboarding flow.
 *
 * Every function degrades gracefully when WIF isn't configured: it returns a
 * stub value (fake folder/file ID) so local dev + missing-secret environments
 * keep working. Callers don't need to branch — `isDriveEnabled()` is only
 * exposed for UI hints ("Drive folder" link vs "Drive disabled" badge).
 */
import { Readable } from "node:stream";
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

/**
 * Create a folder for a single employee inside the configured root folder.
 * Returns the folder's Drive file ID. In stub mode, returns `stub-folder-<rand>`.
 */
export async function createEmployeeFolder(employeeName: string): Promise<string> {
  const drive = getDriveClient();
  const rootFolderId = getRootFolderId();
  const sharedDriveId = getSharedDriveId();

  if (!drive || !rootFolderId || !sharedDriveId) {
    return `${STUB_PREFIX}folder-${Math.random().toString(36).slice(2, 10)}`;
  }

  const res = await drive.files.create({
    requestBody: {
      name: employeeName,
      mimeType: FOLDER_MIME,
      parents: [rootFolderId],
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
