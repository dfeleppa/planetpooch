import { getSession } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { leadOutcomeWindow, matchingOutcomeCustomerIds, summarizeLeadOutcome, type OutcomeCustomerProfile } from "@/lib/marketing/lead-outcomes";
import { normalizedPhone } from "@/lib/marketing/moego-client-history";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { SyncLeadOutcomesButton } from "./SyncLeadOutcomesButton";

const DAYS = [7, 30, 90] as const;
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium" });

export async function LeadOutcomesReport({ days: requestedDays }: { days?: string }) {
  const days = DAYS.find((value) => value === Number(requestedDays)) ?? 30;
  const { since, staleBefore } = leadOutcomeWindow(days);
  const business = await getActiveBusiness();
  const [session, submissions, appointmentSync, orderSync, latestOrder, latestCustomer] = await Promise.all([
    getSession(),
    prisma.websiteFormSubmission.findMany({
      where: { company: business.company, status: "SYNCED", moegoCustomerId: { not: null }, receivedAt: { gte: since } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 500,
      select: { id: true, company: true, receivedAt: true, firstName: true, lastName: true, phone: true, email: true, moegoCustomerId: true, services: true },
    }),
    prisma.moegoSyncState.findUnique({ where: { resource: "appointment" } }),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
    prisma.moegoOrder.aggregate({ _max: { syncedAt: true } }),
    prisma.moegoCustomer.aggregate({ _max: { syncedAt: true } }),
  ]);
  const rows = submissions;
  const phones = [...new Set(rows.map((row) => normalizedPhone(row.phone)).filter((phone): phone is string => phone !== null))];
  const profiles = phones.length ? await prisma.$queryRaw<OutcomeCustomerProfile[]>(Prisma.sql`
    SELECT "moegoId", "name", "email", "mainPhoneNumber"
    FROM "MoegoCustomer"
    WHERE RIGHT(REGEXP_REPLACE(COALESCE("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
      IN (${Prisma.join(phones)})
  `) : [];
  const profilesByPhone = new Map<string, OutcomeCustomerProfile[]>();
  for (const profile of profiles) {
    const phone = normalizedPhone(profile.mainPhoneNumber);
    if (!phone) continue;
    const group = profilesByPhone.get(phone) ?? [];
    group.push(profile);
    profilesByPhone.set(phone, group);
  }
  const matchedRows = rows.map((row) => ({
    row,
    ids: matchingOutcomeCustomerIds({
      moegoCustomerId: row.moegoCustomerId!, phone: row.phone,
      firstName: row.firstName, lastName: row.lastName, email: row.email,
    }, profilesByPhone.get(normalizedPhone(row.phone) ?? "") ?? []),
  }));
  const customerIds = [...new Set(matchedRows.flatMap(({ ids }) => [...ids]))];
  const [appointments, orders] = await Promise.all([
    appointmentSync && customerIds.length ? prisma.moegoAppointment.findMany({
      where: { customerMoegoId: { in: customerIds }, createdTime: { gte: since } },
      select: { customerMoegoId: true, createdTime: true, status: true, isDeleted: true, noShow: true },
    }) : Promise.resolve([]),
    orderSync && customerIds.length ? prisma.moegoOrder.findMany({
      where: { customerMoegoId: { in: customerIds } },
      select: { customerMoegoId: true, status: true, createdTime: true, salesDatetime: true, completedTime: true, paidCents: true, refundedCents: true },
    }) : Promise.resolve([]),
  ]);
  const byCustomerAppointments = new Map<string, typeof appointments>();
  const byCustomerOrders = new Map<string, typeof orders>();
  for (const appointment of appointments) {
    if (!appointment.customerMoegoId) continue;
    const list = byCustomerAppointments.get(appointment.customerMoegoId) ?? [];
    list.push(appointment);
    byCustomerAppointments.set(appointment.customerMoegoId, list);
  }
  for (const order of orders) {
    if (!order.customerMoegoId) continue;
    const list = byCustomerOrders.get(order.customerMoegoId) ?? [];
    list.push(order);
    byCustomerOrders.set(order.customerMoegoId, list);
  }
  const outcomes = matchedRows.map(({ row, ids }) => ({
    ...row,
    profileCount: ids.size,
    result: summarizeLeadOutcome(ids, row.receivedAt,
      [...ids].flatMap((id) => byCustomerAppointments.get(id) ?? []),
      [...ids].flatMap((id) => byCustomerOrders.get(id) ?? [])),
  }));
  const uniqueOutcomes = new Map<string, typeof outcomes[number]>();
  for (const outcome of outcomes) {
    uniqueOutcomes.set(outcome.moegoCustomerId!, outcome);
  }
  const totalBooked = [...uniqueOutcomes.values()].reduce((sum, row) => sum + row.result.booked, 0);
  const totalNetPaidCents = [...uniqueOutcomes.values()].reduce((sum, row) => sum + row.result.netPaidCents, 0);
  const duplicateProfileLeads = outcomes.filter((row) => row.profileCount > 1).length;
  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role ?? "");
  // The general MoeGo sync can advance its order cursor when API permission is
  // denied, so a cursor alone cannot establish that paid totals are current.
  const orderDataAvailable = Boolean(orderSync && latestOrder._max.syncedAt && latestOrder._max.syncedAt >= staleBefore);
  const incomplete = Boolean(!latestCustomer._max.syncedAt || latestCustomer._max.syncedAt < staleBefore ||
    (appointmentSync && appointmentSync.lastSyncedAt < staleBefore) ||
    (orderSync && orderSync.lastSyncedAt < staleBefore) || (orderSync && !orderDataAvailable));

  return <div>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Lead outcomes in MoeGo</h3>
        <p className="mt-1 text-sm text-gray-600">Successful website submissions are matched to their MoeGo customer ID and duplicate profiles with the same phone plus exact name or email. Bookings are confirmed or later appointments created after the form. Net paid is paid amount less refunds on orders recorded after the form for those profiles.</p>
      </div>
      {isAdmin && <SyncLeadOutcomesButton />}
    </div>
    <div className="mb-4 flex flex-wrap gap-2">
      {DAYS.map((value) => <Link key={value} href={`/marketing/ad-reporting?view=outcomes&days=${value}`} className={`rounded-lg px-3 py-1.5 text-sm ${value === days ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{value} days</Link>)}
    </div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Linked customers</p><p className="mt-1 text-2xl font-semibold">{uniqueOutcomes.size}</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Confirmed bookings</p><p className="mt-1 text-2xl font-semibold">{appointmentSync ? totalBooked : "—"}</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Net paid after form</p><p className="mt-1 text-2xl font-semibold">{orderDataAvailable ? money(totalNetPaidCents) : "—"}</p></div>
    </div>
    <p className="mb-4 text-sm text-gray-600">
      {rows.length} linked submissions shown{rows.length === 500 ? " (first 500 only)" : ""}; {duplicateProfileLeads} include verified duplicate MoeGo profiles.
      {appointmentSync ? ` Appointments synced through ${eastern.format(appointmentSync.lastSyncedAt)}.` : " Appointment sync has not run yet."}
      {orderSync ? ` Order cursor through ${eastern.format(orderSync.lastSyncedAt)}.` : " Order sync has not run yet."}
      {!orderDataAvailable && " Recent order data is unavailable; paid totals are hidden."}
      {incomplete && " Counts may be incomplete while a sync is behind."}
    </p>
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-700"><tr>
          {["Submitted", "Customer", "Services", "MoeGo profiles", "Booked", "Pending", "First booked", "Net paid after form"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{outcomes.map((row) => <tr key={row.id} className="border-t border-gray-100 align-top">
          <td className="whitespace-nowrap px-4 py-3">{eastern.format(row.receivedAt)}</td>
          <td className="px-4 py-3">{[row.firstName, row.lastName].filter(Boolean).join(" ") || row.moegoCustomerId}</td>
          <td className="px-4 py-3">{row.services.join(", ") || "—"}</td>
          <td className="px-4 py-3 tabular-nums">{row.profileCount}</td>
          <td className="px-4 py-3 tabular-nums">{appointmentSync ? row.result.booked : "—"}</td>
          <td className="px-4 py-3 tabular-nums">{appointmentSync ? row.result.pending : "—"}</td>
          <td className="whitespace-nowrap px-4 py-3">{appointmentSync && row.result.firstBookedAt ? eastern.format(row.result.firstBookedAt) : "—"}</td>
          <td className="whitespace-nowrap px-4 py-3 tabular-nums">{orderDataAvailable ? money(row.result.netPaidCents) : "—"}</td>
        </tr>)}
        {outcomes.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No linked website submissions in this range.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-gray-500">Duplicate profiles require the same phone and exact name or email; a shared phone alone is excluded. These are observed customer outcomes, not proof that an ad caused them. Unconfirmed appointments appear under Pending. Canceled, deleted, and no-show appointments are excluded.</p>
  </div>;
}
