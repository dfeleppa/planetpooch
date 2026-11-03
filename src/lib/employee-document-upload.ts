import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, MAX_SOURCE_IMAGE_BYTES } from "./employee-documents";

const SIZE_ERROR = "This file is too large. Choose a PDF or image under 4 MB, or a photo under 20 MB that can be resized automatically.";

/** Resize locally: employee identity documents never go to a third-party optimizer. */
export async function prepareEmployeeDocument(file: File): Promise<File> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Choose a PDF or a supported image (PNG, JPEG, WebP, HEIC or HEIF).");
  }
  if (!file.size) throw new Error("This file is empty. Choose another file.");
  if (file.size <= MAX_FILE_SIZE_BYTES) return file;
  if (!file.type.startsWith("image/") || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(SIZE_ERROR);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("This photo could not be resized. Save it as JPEG or PNG, or choose a file under 4 MB.");
    }
    // Keep document text legible; do not repeatedly shrink until it becomes unreadable.
    const scale = Math.min(1, 2800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo. Choose a file under 4 MB.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob || blob.size > MAX_FILE_SIZE_BYTES) throw new Error(SIZE_ERROR);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Proxies can return text/HTML errors before the JSON route handler runs. */
export async function readDocumentUploadResponse(response: Response) {
  if (response.status === 413) throw new Error(SIZE_ERROR);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Upload failed. Please try again.");
  }
  if (!data || typeof data.id !== "string") {
    throw new Error("The server returned an unexpected response. Refresh the page before trying again.");
  }
  return data;
}
