import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(_request: Request, context: RouteContext<"/operations-directory/[document]">) {
  await requireAuth();
  const { document } = await context.params;
  const files: Record<string, string> = JSON.parse(process.env.OPERATIONS_DIRECTORY_PDFS ?? "{}");
  if (!Object.hasOwn(files, document) || !/^[a-z-]+$/.test(document)) notFound();

  return new Response(Buffer.from(files[document], "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
