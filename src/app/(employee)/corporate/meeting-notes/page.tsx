import MarkdownIt from "markdown-it";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canSeeCorporateSidebar } from "@/lib/sidebar-access";
import { NoteForm } from "./NoteForm";

const markdown = new MarkdownIt({ html: false });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function MeetingNotesPage() {
  const { user } = await requireAuth();
  if (!canSeeCorporateSidebar(user)) redirect("/dashboard");
  const notes = await prisma.corporateMeetingNote.findMany({
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="mb-5 text-3xl font-bold">Meeting Notes</h1>
      <NoteForm />
      {notes.map((note, index) => (
        <details key={note.id} open={index === 0} className="mb-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
          <summary className="cursor-pointer text-lg font-semibold">
            {note.title} — <time dateTime={note.meetingDate.toISOString().slice(0, 10)}>{dateFormat.format(note.meetingDate)}</time>
          </summary>
          <div className="lesson-content mt-4 overflow-x-auto [&_table]:w-full [&_th]:bg-slate-50 [&_th]:text-left [&_th]:p-2 [&_td]:border-b [&_td]:border-gray-200 [&_td]:p-2"
            dangerouslySetInnerHTML={{ __html: markdown.render(note.body) }}
          />
        </details>
      ))}
    </section>
  );
}
