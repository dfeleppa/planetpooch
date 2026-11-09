export type LsaCampaignRow = {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string; pmaxCampaignSettings?: { localServicesEnabled?: boolean } };
  metrics?: { costMicros?: string };
};
export type LsaLeadRow = { localServicesLead?: {
  resourceName?: string; campaign?: string; creationDateTime?: string; leadType?: string;
  contactDetails?: { phoneNumber?: string }; serviceId?: string; leadCharged?: boolean;
  creditDetails?: { creditState?: string };
} };
export function isLsaCampaign(row: LsaCampaignRow) {
  return row.campaign?.advertisingChannelType === "LOCAL_SERVICES" || row.campaign?.pmaxCampaignSettings?.localServicesEnabled === true;
}
export function lsaSpendCents(rows: LsaCampaignRow[]) {
  const micros = rows.reduce((sum, row) => {
    const value = row.metrics?.costMicros ?? "0";
    if (!/^\d+$/.test(value)) throw new Error("Google LSA returned invalid spend; previous data has been preserved.");
    return sum + BigInt(value);
  }, BigInt(0));
  const cents = Number((micros + BigInt(5000)) / BigInt(10000));
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error("Google LSA spend exceeds the supported range.");
  return cents;
}
export function normalizeLsaCalls(rows: LsaLeadRow[], campaignIds: Set<string>, from: string, to: string) {
  const calls = new Map<string, { id: string; customer: string | null; leadReceived: string; jobType: string | null; chargeStatus: string }>();
  for (const { localServicesLead: lead } of rows) {
    if (!lead || lead.leadType !== "PHONE_CALL") continue;
    const campaignId = lead.campaign?.split("/").at(-1);
    if (!campaignId || !campaignIds.has(campaignId)) throw new Error("An LSA call has no matching campaign assignment.");
    const day = lead.creationDateTime?.slice(0, 10);
    if (!lead.resourceName || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to) throw new Error("Google LSA returned an invalid call date or ID.");
    calls.set(lead.resourceName, { id: lead.resourceName, customer: lead.contactDetails?.phoneNumber ?? null,
      leadReceived: day, jobType: lead.serviceId ?? null,
      chargeStatus: lead.creditDetails?.creditState === "CREDITED" ? "Credited" : lead.leadCharged ? "Charged" : "Not charged" });
  }
  return [...calls.values()];
}
