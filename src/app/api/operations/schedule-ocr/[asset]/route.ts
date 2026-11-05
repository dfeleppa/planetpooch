import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth-helpers";
import { canManageResortSchedules } from "@/lib/schedule-storage";

const assets: Record<string, string> = {
  "worker.min.js": "tesseract.js/dist/worker.min.js",
  "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  ...Object.fromEntries(["lstm", "simd-lstm", "relaxedsimd-lstm"].map(variant => [`tesseract-core-${variant}.wasm.js`, `tesseract.js-core/tesseract-core-${variant}.wasm.js`])),
};

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const session = await getSession();
  if (!canManageResortSchedules(session?.user)) return new Response("Forbidden", { status: 403 });
  const { asset } = await context.params;
  const relative = assets[asset];
  if (!relative) return new Response("Not found", { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), "node_modules", relative));
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": asset.endsWith(".gz") ? "application/gzip" : "application/javascript; charset=utf-8",
    "Cache-Control": "private, max-age=86400",
    // OCR's WebAssembly runs only inside this worker, with all assets served locally.
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
  } });
}
