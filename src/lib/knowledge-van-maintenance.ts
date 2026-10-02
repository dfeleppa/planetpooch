import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/knowledge";

export function oilChangeVanNumber(question: string): number | null {
  if (!/\boil\s*(?:and\s*filter\s*)?change\b|\boil\s+(?:and\s+filter\s+)?service\b/i.test(question)) return null;
  const number = Number(question.match(/\bvan\s*#?\s*(\d{1,3})\b/i)?.[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export async function findVanOilChangeSource(question: string): Promise<KnowledgeSource[] | null> {
  const number = oilChangeVanNumber(question);
  if (number === null) return null;

  const record = await prisma.groomingVanMaintenance.findFirst({
    where: {
      van: { is: { number } },
      OR: [
        { category: "Oil change" },
        { description: { contains: "oil change", mode: "insensitive" } },
        { description: { contains: "oil and filter", mode: "insensitive" } },
      ],
    },
    orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, serviceDate: true, category: true, description: true, vendor: true, createdAt: true },
  });
  const url = `/maintenance/vans/${number}?company=GROOMING`;
  const checkedAt = new Date().toISOString();
  if (!record) {
    return [{
      id: `record:van-oil-change:${number}:none`, kind: "record",
      title: `No saved oil change: Van ${number}`, url,
      excerpt: `No saved oil change record was found for Van ${number} in the fleet maintenance table. Database checked: ${checkedAt}.`,
      updatedAt: checkedAt, dateKind: "entry",
      answer: `I couldn't find a saved oil change record for van ${number}. Check its maintenance history or ask a manager to confirm. [1]`,
    }];
  }

  const isoDate = record.serviceDate.toISOString().slice(0, 10);
  const date = record.serviceDate.toLocaleDateString("en-US", {
    timeZone: "UTC", month: "long", day: "numeric", year: "numeric",
  });
  const description = record.description.trim().replace(/[.!?]+$/, "");
  const details = [description, record.vendor ? `Vendor: ${record.vendor}` : null].filter(Boolean).join(". ");
  return [{
    id: `record:van-oil-change:${record.id}`, kind: "record",
    title: `Van ${number} oil change: ${isoDate}`, url,
    excerpt: `Van ${number}; service date: ${isoDate}; category: ${record.category}; work performed: ${record.description}; vendor: ${record.vendor ?? "not recorded"}.`,
    updatedAt: record.createdAt.toISOString(), dateKind: "entry",
    answer: `Van ${number}'s latest saved oil change was ${date}. ${details}. [1]`,
  }];
}
