import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

type CashRow = {
  transactionAt: string;
  transactionType: "Sale" | "Refund";
  amountCents: number;
  invoiceId: string;
  bookingId: string;
  occurrence: number;
};

function validRow(value: unknown): value is CashRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.transactionAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.transactionAt) &&
    !Number.isNaN(Date.parse(row.transactionAt)) &&
    (row.transactionType === "Sale" || row.transactionType === "Refund") &&
    typeof row.amountCents === "number" && Number.isSafeInteger(row.amountCents) &&
    Math.abs(row.amountCents) <= 2_147_483_647 &&
    (row.transactionType === "Sale" ? row.amountCents > 0 : row.amountCents < 0) &&
    typeof row.invoiceId === "string" && row.invoiceId.length <= 100 &&
    typeof row.bookingId === "string" && row.bookingId.length <= 100 &&
    typeof row.occurrence === "number" && Number.isSafeInteger(row.occurrence) && row.occurrence > 0;
}

function fingerprint(row: CashRow) {
  return createHash("sha256").update(JSON.stringify([
    row.transactionAt, row.transactionType, row.amountCents,
    row.invoiceId, row.bookingId, row.occurrence,
  ])).digest("hex");
}

export async function POST(request: Request) {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON file." }, { status: 400 }); }
  const body = payload as { source?: unknown; rows?: unknown } | null;
  if (!body || body.source !== "MoeGo Payment transaction report" ||
      !Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 1000 ||
      !body.rows.every(validRow)) {
    return NextResponse.json({ error: "Expected a MoeGo cash transaction import with 1 to 1,000 valid rows." }, { status: 400 });
  }
  const rows = body.rows as CashRow[];
  const fingerprints = rows.map(fingerprint);
  if (new Set(fingerprints).size !== fingerprints.length) {
    return NextResponse.json({ error: "The import contains duplicate cash transactions." }, { status: 400 });
  }
  const inserted = await prisma.financePetResortCashTransaction.createMany({
    data: rows.map((row, index) => ({
      fingerprint: fingerprints[index],
      transactionAt: new Date(row.transactionAt),
      transactionType: row.transactionType,
      amountCents: row.amountCents,
      invoiceId: row.invoiceId,
      bookingId: row.bookingId,
      importedById: user.id!,
    })),
    skipDuplicates: true,
  });
  return NextResponse.json({ inserted: inserted.count, skipped: rows.length - inserted.count });
}
