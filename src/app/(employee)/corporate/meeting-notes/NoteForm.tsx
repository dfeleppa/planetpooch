"use client";

import { useActionState } from "react";
import { saveNote } from "./actions";

export function NoteForm() {
  const [message, action, pending] = useActionState(saveNote, "");
  const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2";

  return (
    <details className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Add meeting notes</summary>
      <form action={action} className="mt-4 grid gap-4">
        <label>Meeting date<input name="meetingDate" type="date" className={input} required /></label>
        <label>Title<input name="title" maxLength={180} className={input} required /></label>
        <label>Notes<textarea name="body" rows={8} maxLength={100000} className={input} required /></label>
        <div className="flex items-center gap-3">
          <button disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
            {pending ? "Saving…" : "Save notes"}
          </button>
          <span role="status">{message}</span>
        </div>
      </form>
    </details>
  );
}
