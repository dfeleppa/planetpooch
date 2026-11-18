"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-helpers";
import { canSeeCorporateSidebar } from "@/lib/sidebar-access";
import { prisma } from "@/lib/prisma";

const fields = z.object({
  meetingDate: z.iso.date(),
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(100000),
});

export async function saveNote(_previous: string, form: FormData) {
  const { user } = await requireAuth();
  if (!canSeeCorporateSidebar(user)) return "Corporate access is required.";
  const parsed = fields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return "Enter a date, title, and notes within the length limits.";
  const { title, body, meetingDate } = parsed.data;
  await prisma.corporateMeetingNote.create({ data: { title, body, meetingDate: new Date(meetingDate) } });
  revalidatePath("/corporate/meeting-notes");
  return "Meeting notes saved.";
}
