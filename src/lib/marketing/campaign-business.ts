import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveBusiness } from "@/lib/business-server";
import type { BusinessCompany } from "@/lib/business";

export const metaCampaignWhereForCompany = cache(async (company: BusinessCompany) => {
  const assignments = await prisma.metaCampaignBusiness.findMany({
    where: { companies: { has: company } }, select: { campaignId: true },
  });
  return { campaignId: { in: assignments.map((assignment) => assignment.campaignId) } };
});

export async function metaBusinessWhere() {
  return metaCampaignWhereForCompany((await getActiveBusiness()).company);
}

export async function getCampaignBusinessAssignments() {
  const [campaigns, assignments] = await Promise.all([
    prisma.metaAdInsight.findMany({
      where: { campaignId: { not: null } }, distinct: ["campaignId"], orderBy: { date: "desc" },
      select: { campaignId: true, campaignName: true },
    }),
    prisma.metaCampaignBusiness.findMany(),
  ]);
  const assigned = new Map(assignments.map((row) => [row.campaignId, row.companies]));
  return campaigns.map((campaign) => ({
    id: campaign.campaignId!, name: campaign.campaignName ?? campaign.campaignId!,
    companies: (assigned.get(campaign.campaignId!) ?? []).filter((value): value is BusinessCompany => value === "RESORT" || value === "GROOMING"),
  }));
}
