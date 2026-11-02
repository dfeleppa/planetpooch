import type { CombinedCampaign } from "./campaign-results";

/** Calls and unattributed inquiries must not inflate paid website performance. */
export function paidOverview(rows: CombinedCampaign[], sources: string[], spend: (source: string) => number | null, formsAvailable: boolean, appointmentsAvailable: boolean, revenueAvailable: boolean) {
  const selected: string[] = sources.filter((source) => source === "meta" || source === "google-ads");
  const paid = rows.filter((row) => selected.includes(row.source));
  const sum = (key: "formLeads" | "linked" | "bookedLeads" | "appointments" | "netPaidCents") => paid.reduce((total, row) => total + row[key], 0);
  const amounts = selected.map(spend);
  const adSpend = amounts.length && amounts.every((amount) => amount !== null) ? amounts.reduce<number>((total, amount) => total + amount!, 0) : null;
  const booked = appointmentsAvailable ? sum("bookedLeads") : null;
  const revenue = revenueAvailable ? sum("netPaidCents") : null;
  return { spend: adSpend, leads: formsAvailable ? sum("formLeads") : null, linked: sum("linked"), booked,
    appointments: appointmentsAvailable ? sum("appointments") : null, revenue,
    costPerBooked: adSpend !== null && booked !== null && booked > 0 ? adSpend / booked : null,
    roas: adSpend !== null && adSpend > 0 && revenue !== null ? revenue / adSpend : null };
}
