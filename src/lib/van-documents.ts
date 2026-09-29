import { createHash } from "node:crypto";
import { MAX_VAN_DOCUMENT_BYTES } from "@/lib/van-document-size";


export type VanDocument = { buffer: Buffer; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; name: string; sha256: string };

export async function readVanDocument(file: File): Promise<VanDocument> {
  if (!file.size || file.size > MAX_VAN_DOCUMENT_BYTES) throw new Error("Choose a JPG, PNG, WebP, or PDF under 4 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  let mimeType: VanDocument["mimeType"] | null = null;
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) mimeType = "image/jpeg";
  else if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = "image/png";
  else if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") mimeType = "image/webp";
  else if (buffer.toString("ascii", 0, 5) === "%PDF-") mimeType = "application/pdf";
  if (!mimeType) throw new Error("This file is not a supported JPG, PNG, WebP, or PDF.");
  const name = file.name.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 150) || "maintenance-record";
  return { buffer, mimeType, name, sha256: createHash("sha256").update(buffer).digest("hex") };
}
