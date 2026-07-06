import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import {
  isValidPayrollWeekRange,
  normalizeEmployeeName,
  payrollPayPeriodForBusiness,
} from "@/lib/payroll";
import {
  MoegoApiError,
  MoegoConfigError,
  streamAppointments,
  streamOrders,
  streamPayments,
  streamStaffs,
  toCents,
  type MoegoAppointmentRow,
  type MoegoOrderRow,
  type MoegoPaymentRow,
  type MoegoStaffRow,
} from "@/lib/moego/client";
import { MOBILE_GROOMING_BUSINESS_ID } from "@/lib/moego/mobile-grooming-weekly-report";

export const maxDuration = 120;

const MS_PER_DAY = 86_400_000;
const PAYROLL_TIME_ZONE = "America/New_York";
const MOEGO_STAFF_NAME_ALIASES: Record<string, string> = {
  "debrah r vesce": "Debbie Vesce",
  "kathleen-isabel valladares-maldonado": "Kathleen Valladares",
};

type MobilePayrollImportEntry = {
  serviceDate: string;
  employeeName: string;
  paymentType: "cash" | "credit";
  dogs: number;
  priceCents: number;
  upgradeQuantity: number;
  upgradeCents: number;
  creditCardTipCents: number;
  discountCents: number;
};

function unauthorized() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function canAccessPayroll() {
  const session = await getSession();
  return !!session?.user && isSuperAdmin((session.user as { role?: string }).role);
}

function parseDateParam(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function timeZoneParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PAYROLL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function timeZoneOffsetMinutes(date: Date): number {
  const parts = timeZoneParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return (asUtc - date.getTime()) / 60_000;
}

function localDateStartUtcIso(value: string): string {
  const date = parseDateParam(value);
  if (!date) throw new Error("Invalid date");
  const guess = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const offset = timeZoneOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60_000).toISOString();
}

function localIsoDate(dateTime: string | undefined): string | null {
  if (!dateTime) return null;
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return null;
  const parts = timeZoneParts(date);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function staffDisplayName(staff: MoegoStaffRow): string {
  return normalizeEmployeeName(`${staff.firstName ?? ""} ${staff.lastName ?? ""}`);
}

function moegoStaffLookupName(employeeName: string): string {
  return MOEGO_STAFF_NAME_ALIASES[employeeName.toLowerCase()] ?? employeeName;
}

function nameWords(value: string): string[] {
  return normalizeEmployeeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function isEditDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  if (left.length === right.length) {
    let differences = 0;
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) differences++;
      if (differences > 1) return false;
    }
    return true;
  }

  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let shorterIndex = 0;
  let longerIndex = 0;
  let differences = 0;

  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex++;
      longerIndex++;
      continue;
    }
    differences++;
    if (differences > 1) return false;
    longerIndex++;
  }

  return true;
}

function isSurnameWordMatch(staffWord: string, employeeWord: string): boolean {
  if (staffWord === employeeWord) return true;
  if (Math.min(staffWord.length, employeeWord.length) < 5) return false;
  return isEditDistanceAtMostOne(staffWord, employeeWord);
}

function isStaffNameMatch(staffName: string, employeeName: string): boolean {
  const staffWords = nameWords(staffName);
  const employeeWords = nameWords(employeeName);
  if (staffWords.length === 0 || employeeWords.length === 0) return false;
  if (staffWords.join(" ") === employeeWords.join(" ")) return true;
  if (!staffWords.includes(employeeWords[0])) return false;
  return employeeWords
    .slice(1)
    .every((employeeWord) =>
      staffWords.some((staffWord) => isSurnameWordMatch(staffWord, employeeWord))
    );
}

async function listAllStaffs(): Promise<MoegoStaffRow[]> {
  const rows: MoegoStaffRow[] = [];
  for await (const page of streamStaffs()) rows.push(...page);
  return rows;
}

async function listWeeklyAppointments(weekStart: string, weekEnd: string) {
  const rows: MoegoAppointmentRow[] = [];
  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: localDateStartUtcIso(weekStart),
        endTime: localDateStartUtcIso(toDateParam(addDays(dateFromParam(weekEnd), 1))),
      },
    },
    [MOBILE_GROOMING_BUSINESS_ID]
  )) {
    rows.push(...page);
  }
  return rows;
}

function dateFromParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function ordersById(orderIds: string[]) {
  const found = new Map<string, MoegoOrderRow>();
  if (orderIds.length === 0) return found;
  for (const chunk of chunks(orderIds, 50)) {
    const wanted = new Set(chunk);
    for await (const page of streamOrders({ ids: chunk }, [MOBILE_GROOMING_BUSINESS_ID])) {
      for (const order of page) {
        if (order.id && wanted.has(order.id)) found.set(order.id, order);
      }
    }
  }
  return found;
}

async function paymentsByOrderId(orderIds: string[]) {
  const found = new Map<string, MoegoPaymentRow[]>();
  if (orderIds.length === 0) return found;
  for (const chunk of chunks(orderIds, 50)) {
    for await (const page of streamPayments({ orderIds: chunk })) {
      for (const payment of page) {
        if (!payment.orderId) continue;
        const rows = found.get(payment.orderId) ?? [];
        rows.push(payment);
        found.set(payment.orderId, rows);
      }
    }
  }
  return found;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isGroomingLine(name: string | undefined): boolean {
  return String(name ?? "").toLowerCase().includes("groom");
}

function paymentType(payments: MoegoPaymentRow[]): "cash" | "credit" {
  if (payments.length === 0) return "credit";
  const hasCash = payments.some((payment) =>
    String(payment.method ?? "").toLowerCase().includes("cash")
  );
  const hasNonCash = payments.some(
    (payment) => !String(payment.method ?? "").toLowerCase().includes("cash")
  );
  return hasCash && !hasNonCash ? "cash" : "credit";
}

function hasCreditCardPayment(payments: MoegoPaymentRow[]): boolean {
  return payments.some((payment) => {
    const method = String(payment.method ?? "").toLowerCase();
    return method.includes("credit") || method.includes("card");
  });
}

function entriesForStaff(options: {
  appointments: MoegoAppointmentRow[];
  orders: Map<string, MoegoOrderRow>;
  payments: Map<string, MoegoPaymentRow[]>;
  staffId: string;
  employeeName: string;
}): MobilePayrollImportEntry[] {
  const entries: MobilePayrollImportEntry[] = [];

  for (const appointment of options.appointments) {
    if (appointment.status !== "FINISHED") continue;

    let priceCents = 0;
    let upgradeCents = 0;
    let upgradeQuantity = 0;
    const petKeys = new Set<string>();

    for (const petDetail of appointment.petServiceDetails ?? []) {
      let petMatched = false;
      for (const service of petDetail.serviceDetails ?? []) {
        if (!(service.staffIds ?? []).includes(options.staffId)) continue;
        petMatched = true;
        if (isGroomingLine(service.name)) {
          priceCents += toCents(service.price);
        } else {
          upgradeQuantity++;
          upgradeCents += toCents(service.price);
        }
      }

      if (petMatched) {
        petKeys.add(
          petDetail.pet?.id ?? petDetail.pet?.name ?? `${appointment.id}:${petKeys.size}`
        );
      }
    }

    if (petKeys.size === 0) continue;

    const order = appointment.orderId ? options.orders.get(appointment.orderId) : undefined;
    const paymentRows = appointment.orderId ? options.payments.get(appointment.orderId) ?? [] : [];

    entries.push({
      serviceDate: localIsoDate(appointment.duration?.startTime) ?? "",
      employeeName: options.employeeName,
      paymentType: paymentType(paymentRows),
      dogs: petKeys.size,
      priceCents,
      upgradeQuantity,
      upgradeCents,
      creditCardTipCents: hasCreditCardPayment(paymentRows) ? toCents(order?.tipsAmount) : 0,
      discountCents: toCents(order?.discountAmount),
    });
  }

  return entries.filter((entry) => entry.serviceDate);
}

function totalsFor(entries: MobilePayrollImportEntry[]) {
  return entries.reduce(
    (total, entry) => {
      const totalPriceCents = entry.priceCents + entry.upgradeCents - entry.discountCents;
      total.appointments += 1;
      total.pets += entry.dogs;
      total.groomingPriceCents += entry.priceCents;
      total.totalPriceCents += totalPriceCents;
      total.cashCents += entry.paymentType === "cash" ? totalPriceCents : 0;
      total.creditCardTipCents += entry.creditCardTipCents;
      total.upgradeCents += entry.upgradeCents;
      return total;
    },
    {
      appointments: 0,
      pets: 0,
      groomingPriceCents: 0,
      totalPriceCents: 0,
      cashCents: 0,
      creditCardTipCents: 0,
      upgradeCents: 0,
    }
  );
}

export async function POST(req: NextRequest) {
  if (!(await canAccessPayroll())) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const employeeName = normalizeEmployeeName(String(body.employeeName ?? ""));
  const weekStart = parseDateParam(body.weekStart);
  const weekEnd = parseDateParam(body.weekEnd);
  if (!employeeName) {
    return NextResponse.json({ error: "employeeName is required" }, { status: 400 });
  }
  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: "weekStart and weekEnd must be YYYY-MM-DD dates" }, { status: 400 });
  }
  if (!isValidPayrollWeekRange(weekStart, weekEnd, "mobile-grooming")) {
    return NextResponse.json(
      { error: payrollPayPeriodForBusiness("mobile-grooming").errorMessage },
      { status: 400 }
    );
  }

  try {
    const lookupName = moegoStaffLookupName(employeeName);
    const staffs = await listAllStaffs();
    const staff = staffs.find(
      (candidate) =>
        !candidate.deleted &&
        (candidate.workingBusinessIds ?? []).includes(MOBILE_GROOMING_BUSINESS_ID) &&
        isStaffNameMatch(staffDisplayName(candidate), lookupName)
    );
    if (!staff) {
      return NextResponse.json(
        { error: `Could not find a MoeGo mobile grooming staff match for ${employeeName}.` },
        { status: 404 }
      );
    }

    const appointments = await listWeeklyAppointments(
      toDateParam(weekStart),
      toDateParam(weekEnd)
    );
    const matchedAppointments = appointments.filter((appointment) =>
      (appointment.petServiceDetails ?? []).some((petDetail) =>
        (petDetail.serviceDetails ?? []).some((service) =>
          (service.staffIds ?? []).includes(staff.id)
        )
      )
    );
    const orderIds = [
      ...new Set(matchedAppointments.map((appointment) => appointment.orderId).filter(Boolean)),
    ] as string[];
    const [orders, payments] = await Promise.all([
      ordersById(orderIds),
      paymentsByOrderId(orderIds),
    ]);
    const entries = entriesForStaff({
      appointments: matchedAppointments,
      orders,
      payments,
      staffId: staff.id,
      employeeName,
    });
    const statusCounts = matchedAppointments.reduce<Record<string, number>>((counts, appointment) => {
      const status = appointment.status ?? "UNKNOWN";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});

    return NextResponse.json({
      staff: {
        id: staff.id,
        name: staffDisplayName(staff),
      },
      businessId: MOBILE_GROOMING_BUSINESS_ID,
      weekStart: toDateParam(weekStart),
      weekEnd: toDateParam(weekEnd),
      entries,
      totals: totalsFor(entries),
      statusCounts,
    });
  } catch (err) {
    if (err instanceof MoegoConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MoegoApiError) {
      return NextResponse.json({ error: `MoeGo API: ${err.message}` }, { status: err.status });
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error("Mobile grooming payroll MoeGo import failed:", err);
    return NextResponse.json(
      { error: `Mobile grooming payroll MoeGo import failed: ${message}` },
      { status: 500 }
    );
  }
}
