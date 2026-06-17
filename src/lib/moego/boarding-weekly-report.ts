import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addWeeks, fromWeekParam, toWeekParam, weekStartOf } from "@/lib/week";
import {
  streamAppointments,
  streamOrders,
  toCents,
  type MoegoAppointmentRow,
  type MoegoAppointmentServiceDetail,
} from "@/lib/moego/client";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/daycare-weekly-report";

const BOARDING_KPI_METRICS = {
  revenue: "revenue",
  packages: "package_sales",
  addons: "addon_sales",
  nights: "nights",
} as const;

const BOARDING_APPOINTMENT_LOOKBACK_WEEKS = 12;
const UPCOMING_BOARDING_BOOKING_WEEKS = 13;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const BOARDING_SERVICE_NAMES = [
  "classic group play",
  "classic 1 on 1",
  "classic platinum",
  "classic silver",
  "express a group play",
  "express a 1 on 1",
  "express a platinum",
  "express b group play",
  "express b 1 on 1",
  "luxury group play",
  "luxury 1 on 1",
  "xl group play",
  "xl 1 on 1",
] as const;

const BOARDING_SERVICE_NAME_SET = new Set<string>(BOARDING_SERVICE_NAMES);

const BOARDING_PACKAGE_NAMES = [
  "comfort care",
  "premium care",
  "comfort plus care",
] as const;

const BOARDING_ADDON_NAMES = [
  "frozen kong",
  "pupkin spiced latte",
  "thanksgiving dinner",
  "fetch",
  "basic training",
  "pup cup",
  "tug of war",
  "boarding easy scent games included",
  "boarding bubble activity included",
  "boarding snuffle mats included",
  "boarding dog marathon included",
  "boarding puzzles included",
  "one on one time included",
  "enrichment activity included",
  "full day included",
  "half day daycare included",
  "walk explore",
  "paw sicle treat time",
  "bark lickin treat",
  "snuggle buddy",
  "kong tastic delight",
  "furry birthday celebration",
  "senior comfort zone",
  "dreamy tales night time",
  "welcome wagon",
  "canine cinema night",
] as const;

export type WeeklyBoardingReport = {
  weekStart: string;
  weekEnd: string;
  businessId: string;
  totalFinishedBoardingAppointments: number;
  totalRevenueCents: number;
  nights: number;
  packageSalesCents: number;
  addonSalesCents: number;
  nightsByService: Record<string, number>;
};

export type WeeklyBoardingKpiValues = {
  weekStart: string;
  totalRevenueCents: number;
  packageSalesCents: number;
  addonSalesCents: number;
  nights: number;
};

export type UpcomingBoardingBookingWeek = {
  weekStart: string;
  weekEnding: string;
  nightCount: number;
};

export type UpcomingBoardingBookingsReport = {
  businessId: string;
  generatedAt: string | null;
  windowStart: string;
  windowEnd: string;
  totalNights: number;
  weeks: UpcomingBoardingBookingWeek[];
};

type StoredUpcomingBoardingNightRow = {
  weekStart: Date;
  weekEnding: Date;
  nightCount: number;
  syncedAt: Date;
};

function moneyValue(cents: number): number {
  return Math.round(cents);
}

function numberValue(value: number): number {
  return Math.round(value * 100);
}

function serviceLines(appointment: MoegoAppointmentRow): MoegoAppointmentServiceDetail[] {
  return (appointment.petServiceDetails ?? []).flatMap(
    (petService) => petService.serviceDetails ?? []
  );
}

function normalizeServiceName(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .replace(/[/&(),$]/g, " ")
    .replace(/-/g, " ")
    .replace(/[']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeServiceItemType(type: string | undefined): string {
  return (type ?? "").trim().toUpperCase();
}

const BOARDING_PACKAGE_NAME_SET = new Set<string>(
  BOARDING_PACKAGE_NAMES.map(normalizeServiceName)
);
const BOARDING_ADDON_NAME_SET = new Set<string>(
  BOARDING_ADDON_NAMES.map(normalizeServiceName)
);

function isBoardingPackage(service: MoegoAppointmentServiceDetail): boolean {
  return BOARDING_PACKAGE_NAME_SET.has(normalizeServiceName(service.name));
}

function isBoardingAddon(service: MoegoAppointmentServiceDetail): boolean {
  return BOARDING_ADDON_NAME_SET.has(normalizeServiceName(service.name));
}

function isBoardingService(service: MoegoAppointmentServiceDetail): boolean {
  // MoeGo reuses names like "Full day daycare" across modules. Prefer the
  // explicit item type when present so daycare rows do not inflate boarding.
  const itemType = normalizeServiceItemType(service.serviceItemType);
  if (itemType) return itemType === "BOARDING";

  const name = normalizeServiceName(service.name);
  const category = (service.category ?? "").toLowerCase();
  if (BOARDING_SERVICE_NAME_SET.has(name)) return true;

  const hasGroupOrOneOnOne =
    /(group play|1\s*on\s*1|1on1|1-1)/.test(name);
  const isPlayOrSolo = /(^|\s)(express|classic|luxury|xl)(\s+a)?\s+/.test(name) && hasGroupOrOneOnOne;

  return (
    name.includes("boarding") ||
    name.includes("board") ||
    category.includes("boarding") ||
    category.includes("board") ||
    isPlayOrSolo
  );
}

function netLineCents(
  lineGrossCents: number,
  appointmentGrossCents: number,
  order?: {
    subTotalCents: number;
    discountCents: number;
    status?: string;
  }
): number {
  if (
    !order ||
    !REVENUE_ORDER_STATUSES.includes(
      order.status as (typeof REVENUE_ORDER_STATUSES)[number]
    )
  ) {
    return lineGrossCents;
  }

  const baseGrossCents =
    appointmentGrossCents > 0 ? appointmentGrossCents : order.subTotalCents;
  if (baseGrossCents <= 0) return lineGrossCents;

  const discountShare = Math.round(
    (lineGrossCents / baseGrossCents) * order.discountCents
  );
  return Math.max(0, lineGrossCents - discountShare);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCanceledOrInactiveBooking(appointment: MoegoAppointmentRow): boolean {
  const status = (appointment.status ?? "").toUpperCase();
  return status.includes("CANCEL") || appointment.isDeleted === true || appointment.noShow === true;
}

function utcDateOnlyTime(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function appointmentStayRange(appointment: MoegoAppointmentRow): {
  start: Date;
  end: Date;
} | null {
  const start = parseDate(appointment.checkInTime) ?? parseDate(appointment.duration?.startTime);
  const end = parseDate(appointment.checkOutTime) ?? parseDate(appointment.duration?.endTime);
  return start && end ? { start, end } : null;
}

function appointmentStartDate(appointment: MoegoAppointmentRow): Date | null {
  return parseDate(appointment.checkInTime) ?? parseDate(appointment.duration?.startTime);
}

function totalStayNights(appointment: MoegoAppointmentRow): number {
  const range = appointmentStayRange(appointment);
  if (!range) return 1;

  const start = utcDateOnlyTime(range.start);
  const end = utcDateOnlyTime(range.end);
  if (!(Number.isFinite(start) && Number.isFinite(end)) || end <= start) {
    return 1;
  }

  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

function upcomingBoardingWindow(today: Date, weekCount: number) {
  const baseWeekStart = weekStartOf(today);
  const windowStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const windowEnd = addWeeks(baseWeekStart, weekCount);
  const weekRows = Array.from({ length: weekCount }, (_, index) => {
    const weekStart = addWeeks(baseWeekStart, index);
    const weekEnding = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    return {
      weekStart,
      key: toWeekParam(weekStart),
      weekEnding,
      weekEndingKey: toWeekParam(weekEnding),
      nightCount: 0,
    };
  });

  return { windowStart, windowEnd, weekRows };
}

function dateFromWeekParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function storedUpcomingBoardingReport(options: {
  businessId: string;
  today: Date;
  weekCount: number;
  rows: StoredUpcomingBoardingNightRow[];
}): UpcomingBoardingBookingsReport {
  const { windowStart, windowEnd, weekRows } = upcomingBoardingWindow(
    options.today,
    options.weekCount
  );
  const storedByWeek = new Map(
    options.rows.map((row) => [toWeekParam(row.weekStart), row])
  );
  let generatedAtTime = 0;
  let generatedAtIso: string | null = null;

  const weeks = weekRows.map((row) => {
    const stored = storedByWeek.get(row.key);
    const syncedAtTime = stored?.syncedAt.getTime() ?? 0;
    if (stored && syncedAtTime > generatedAtTime) {
      generatedAtTime = syncedAtTime;
      generatedAtIso = stored.syncedAt.toISOString();
    }
    return {
      weekStart: row.key,
      weekEnding: row.weekEndingKey,
      nightCount: stored?.nightCount ?? 0,
    };
  });

  return {
    businessId: options.businessId,
    generatedAt: generatedAtIso,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalNights: weeks.reduce((sum, row) => sum + row.nightCount, 0),
    weeks,
  };
}

function stayNightsInWindow(
  appointment: MoegoAppointmentRow,
  weekStart: Date,
  weekEnd: Date
): number {
  const range = appointmentStayRange(appointment);
  if (!range) return 1;

  const overlapStart = Math.max(utcDateOnlyTime(range.start), utcDateOnlyTime(weekStart));
  const overlapEnd = Math.min(utcDateOnlyTime(range.end), utcDateOnlyTime(weekEnd));
  if (!(Number.isFinite(overlapStart) && Number.isFinite(overlapEnd)) || overlapEnd <= overlapStart) {
    return 0;
  }

  const oneDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((overlapEnd - overlapStart) / oneDay));
}

function stayOverlapsWindow(
  appointment: MoegoAppointmentRow,
  weekStart: Date,
  weekEnd: Date
): boolean {
  const range = appointmentStayRange(appointment);
  if (!range) return true;

  return (
    utcDateOnlyTime(range.start) < utcDateOnlyTime(weekEnd) &&
    utcDateOnlyTime(range.end) > utcDateOnlyTime(weekStart)
  );
}

function previousCompletedWeek(today = new Date()): {
  start: Date;
  end: Date;
} {
  const currentStart = weekStartOf(today);
  const start = addWeeks(currentStart, -1);
  const end = addWeeks(start, 1);
  return { start, end };
}

async function listFinishedBoardingAppointments(
  start: Date,
  end: Date,
  businessId: string
): Promise<MoegoAppointmentRow[]> {
  const appointments: MoegoAppointmentRow[] = [];
  const lookupStart = addWeeks(start, -BOARDING_APPOINTMENT_LOOKBACK_WEEKS);
  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: lookupStart.toISOString(),
        endTime: end.toISOString(),
      },
      statuses: ["FINISHED"],
    },
    [businessId]
  )) {
    appointments.push(...page);
  }
  return appointments;
}

async function listUpcomingBoardingAppointments(
  start: Date,
  end: Date,
  businessId: string
): Promise<MoegoAppointmentRow[]> {
  const appointments: MoegoAppointmentRow[] = [];
  for await (const page of streamAppointments(
    {
      startTime: {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      serviceTypes: ["BOARDING"],
    },
    [businessId]
  )) {
    appointments.push(...page);
  }
  return appointments;
}

async function ordersById(
  orderIds: string[],
  start: Date,
  end: Date,
  businessId: string
): Promise<Map<string, { subTotalCents: number; discountCents: number; status?: string }>> {
  if (orderIds.length === 0) return new Map();

  const wanted = new Set(orderIds);
  const found = new Map<string, { subTotalCents: number; discountCents: number; status?: string }>();
  const lookupStart = addWeeks(start, -12);
  const lookupEnd = addWeeks(end, 12);

  for await (const page of streamOrders(
    {
      lastUpdatedTime: {
        startTime: lookupStart.toISOString(),
        endTime: lookupEnd.toISOString(),
      },
    },
    [businessId]
  )) {
    for (const order of page) {
      if (!order.id || !wanted.has(order.id)) continue;
      found.set(order.id, {
        status: order.status,
        subTotalCents: toCents(order.subTotalAmount),
        discountCents: toCents(order.discountAmount),
      });
    }

    if (found.size === wanted.size) break;
  }

  return found;
}

export async function buildWeeklyBoardingReport(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyBoardingReport> {
  const start = options?.weekStart
    ? fromWeekParam(options.weekStart)
    : previousCompletedWeek(options?.today).start;
  const end = addWeeks(start, 1);
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;

  const appointments = await listFinishedBoardingAppointments(start, end, businessId);
  const boardingAppointments = appointments.filter((appointment) => {
    const lines = serviceLines(appointment);
    return (
      lines.some(isBoardingService) &&
      stayOverlapsWindow(appointment, start, end) &&
      stayNightsInWindow(appointment, start, end) > 0
    );
  });
  const orderIds = [
    ...new Set(
      boardingAppointments
        .map((appointment) => appointment.orderId)
        .filter((orderId): orderId is string => Boolean(orderId))
    ),
  ];
  const orderMoney = await ordersById(orderIds, start, end, businessId);

  let nights = 0;
  const countedNightKeys = new Set<string>();
  const nightsByService = new Map<string, number>();
  let packageSalesCents = 0;
  let addonSalesCents = 0;
  let totalRevenueCents = 0;

  for (const appointment of boardingAppointments) {
    const lines = serviceLines(appointment);

    const appointmentGrossCents = lines.reduce(
      (sum, service) => sum + toCents(service.price),
      0
    );
    const order = appointment.orderId ? orderMoney.get(appointment.orderId) : undefined;
    const capacityUnits = stayNightsInWindow(appointment, start, end);
    if (capacityUnits <= 0) continue;

    for (const service of lines) {
      const grossCents = toCents(service.price);
      if (grossCents <= 0) continue;

      if (isBoardingPackage(service)) {
        packageSalesCents += grossCents * capacityUnits;
      } else if (isBoardingAddon(service)) {
        addonSalesCents += grossCents;
      } else if (isBoardingService(service)) {
        const netCents = netLineCents(grossCents, appointmentGrossCents, order);
        if (netCents <= 0) continue;
        totalRevenueCents += netCents * capacityUnits;
        const nightKey = appointment.orderId || appointment.id;
        if (!countedNightKeys.has(nightKey)) {
          nights += capacityUnits;
          countedNightKeys.add(nightKey);
        }
        const serviceName = service.name?.trim() ?? "(unnamed service)";
        nightsByService.set(serviceName, (nightsByService.get(serviceName) || 0) + capacityUnits);
      }
    }
  }

  return {
    weekStart: toWeekParam(start),
    weekEnd: toWeekParam(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    businessId,
    totalFinishedBoardingAppointments: boardingAppointments.length,
    totalRevenueCents,
    nights,
    packageSalesCents,
    addonSalesCents,
    nightsByService: Object.fromEntries(
      [...nightsByService.entries()].sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

export async function buildUpcomingBoardingBookingsReport(options?: {
  today?: Date;
  businessId?: string;
  weeks?: number;
}): Promise<UpcomingBoardingBookingsReport> {
  const today = options?.today ?? new Date();
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;
  const weekCount = options?.weeks ?? UPCOMING_BOARDING_BOOKING_WEEKS;
  const { windowStart, windowEnd, weekRows } = upcomingBoardingWindow(today, weekCount);
  const countsByWeek = new Map(weekRows.map((row) => [row.key, row]));
  const appointments = await listUpcomingBoardingAppointments(
    windowStart,
    windowEnd,
    businessId
  );

  for (const appointment of appointments) {
    if (isCanceledOrInactiveBooking(appointment)) continue;
    const lines = serviceLines(appointment);
    if (!lines.some(isBoardingService)) continue;
    const start = appointmentStartDate(appointment);
    if (!start || start < windowStart || start >= windowEnd) continue;

    const weekKey = toWeekParam(weekStartOf(start));
    const row = countsByWeek.get(weekKey);
    if (row) row.nightCount += totalStayNights(appointment);
  }

  const weeks = weekRows.map((row) => ({
    weekStart: row.key,
    weekEnding: row.weekEndingKey,
    nightCount: row.nightCount,
  }));

  return {
    businessId,
    generatedAt: today.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalNights: weeks.reduce((sum, row) => sum + row.nightCount, 0),
    weeks,
  };
}

export async function getStoredUpcomingBoardingBookingsReport(options?: {
  today?: Date;
  businessId?: string;
  weeks?: number;
}): Promise<UpcomingBoardingBookingsReport> {
  const today = options?.today ?? new Date();
  const businessId = options?.businessId ?? PET_RESORT_BUSINESS_ID;
  const weekCount = options?.weeks ?? UPCOMING_BOARDING_BOOKING_WEEKS;
  const { windowEnd, weekRows } = upcomingBoardingWindow(today, weekCount);
  const firstWeekStart = weekRows[0]?.weekStart ?? weekStartOf(today);
  const rows = await prisma.$queryRaw<StoredUpcomingBoardingNightRow[]>(Prisma.sql`
    SELECT "weekStart", "weekEnding", "nightCount", "syncedAt"
    FROM "MoegoUpcomingBoardingNight"
    WHERE "businessId" = ${businessId}
      AND "weekStart" >= ${firstWeekStart}
      AND "weekStart" < ${windowEnd}
    ORDER BY "weekStart" ASC
  `);

  return storedUpcomingBoardingReport({
    businessId,
    today,
    weekCount,
    rows,
  });
}

export async function refreshUpcomingBoardingBookingsReport(options?: {
  today?: Date;
  businessId?: string;
  weeks?: number;
}): Promise<UpcomingBoardingBookingsReport> {
  const report = await buildUpcomingBoardingBookingsReport(options);
  const syncedAt = report.generatedAt ? new Date(report.generatedAt) : new Date();
  const weekStartDates = report.weeks.map((row) => dateFromWeekParam(row.weekStart));

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "MoegoUpcomingBoardingNight"
      WHERE "businessId" = ${report.businessId}
        AND "weekStart" NOT IN (${Prisma.join(weekStartDates)})
    `),
    ...report.weeks.map((row) =>
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "MoegoUpcomingBoardingNight"
          ("id", "businessId", "weekStart", "weekEnding", "nightCount", "syncedAt", "updatedAt")
        VALUES
          (
            ${`mubn_${report.businessId}_${row.weekStart}`},
            ${report.businessId},
            ${dateFromWeekParam(row.weekStart)},
            ${dateFromWeekParam(row.weekEnding)},
            ${row.nightCount},
            ${syncedAt},
            CURRENT_TIMESTAMP
          )
        ON CONFLICT ("businessId", "weekStart") DO UPDATE SET
          "weekEnding" = EXCLUDED."weekEnding",
          "nightCount" = EXCLUDED."nightCount",
          "syncedAt" = EXCLUDED."syncedAt",
          "updatedAt" = CURRENT_TIMESTAMP
      `)
    ),
  ]);

  return getStoredUpcomingBoardingBookingsReport({
    today: options?.today,
    businessId: report.businessId,
    weeks: options?.weeks,
  });
}

export async function upsertWeeklyBoardingKpis(
  values: WeeklyBoardingKpiValues
): Promise<void> {
  const weekStart = new Date(`${values.weekStart}T00:00:00.000Z`);
  const rows = [
    {
      metricKey: BOARDING_KPI_METRICS.revenue,
      value: moneyValue(values.totalRevenueCents),
    },
    {
      metricKey: BOARDING_KPI_METRICS.packages,
      value: moneyValue(values.packageSalesCents),
    },
    {
      metricKey: BOARDING_KPI_METRICS.addons,
      value: moneyValue(values.addonSalesCents),
    },
    {
      metricKey: BOARDING_KPI_METRICS.nights,
      value: numberValue(values.nights),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.BOARDING,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.BOARDING,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}

export async function syncWeeklyBoardingKpis(options?: {
  weekStart?: string;
  today?: Date;
  businessId?: string;
}): Promise<WeeklyBoardingReport> {
  const report = await buildWeeklyBoardingReport(options);
  await upsertWeeklyBoardingKpis({
    weekStart: report.weekStart,
    totalRevenueCents: report.totalRevenueCents,
    packageSalesCents: report.packageSalesCents,
    addonSalesCents: report.addonSalesCents,
    nights: report.nights,
  });

  return report;
}
