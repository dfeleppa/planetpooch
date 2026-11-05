"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clockLabel, coverageRows, inputTime, type ScheduleShift, type WeeklySchedule } from "@/lib/schedule-formatter";

export function ScheduleFormatter() {
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  let validation = "";
  let rows: ReturnType<typeof coverageRows> = [];
  try { rows = coverageRows(schedule?.shifts ?? []); }
  catch (error) { validation = error instanceof Error ? error.message : "Check the shift times."; }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setSchedule(null); setReviewed(false);
    try {
      const { readSchedulePdf } = await import("@/lib/read-schedule-pdf");
      setSchedule(await readSchedulePdf(file));
    } catch (error) { setError(error instanceof Error ? error.message : "This PDF could not be read. Choose the original ADP PDF."); }
    finally { setBusy(false); }
  }

  function changeShifts(shifts: ScheduleShift[]) {
    setReviewed(false); setError("");
    setSchedule(current => current && ({ ...current, shifts }));
  }

  function changeShift(id: string, changes: Partial<ScheduleShift>) {
    if (schedule) changeShifts(schedule.shifts.map(shift => shift.id === id ? { ...shift, ...changes } : shift));
  }

  async function download() {
    if (!schedule || !reviewed || validation) return;
    setExporting(true); setError("");
    try {
      const { buildSchedulePdf } = await import("@/lib/schedule-pdf");
      const bytes = await buildSchedulePdf(schedule);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `Planet-Pooch-${schedule.title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "") || "Staffing-Schedule"}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create the PDF. Try again."); }
    finally { setExporting(false); }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-pp-line bg-white p-5" aria-labelledby="upload-schedule-heading">
        <h2 id="upload-schedule-heading" className="font-semibold">Upload weekly schedule</h2>
        <p className="mt-1 mb-4 text-sm text-gray-500">Choose the original ADP Team Schedule PDF (up to 10 MB). Files are processed in this browser.</p>
        <label htmlFor="schedule-file" className="mb-2 block text-sm font-medium">Schedule PDF</label>
        <input id="schedule-file" type="file" accept="application/pdf,.pdf" disabled={busy || exporting} className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-pp-mint file:px-4 file:py-2 file:font-semibold"
          onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        <p className="mt-3 text-sm text-gray-500">Each day shows employees on duty and their count. Hours split into separate rows wherever a shift starts or ends, including half hours.</p>
        {busy && <p role="status" className="mt-3 text-sm">Reading schedule…</p>}
      </section>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {schedule && <>
        {schedule.warnings.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" aria-label="Source review notes">
          <h2 className="font-semibold">Check these details in the source</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">{schedule.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </section>}
        <section className="rounded-xl border border-pp-line bg-white p-5" aria-labelledby="review-shifts-heading">
          <h2 id="review-shifts-heading" className="font-semibold">{schedule.title || "Weekly schedule"}</h2>
          <p className="mt-1 text-sm text-gray-500">{schedule.shifts.length} working shifts · {new Set(schedule.shifts.map(shift => shift.employee)).size} employees · {(schedule.shifts.reduce((sum, shift) => sum + shift.end - shift.start, 0) / 60).toFixed(2)} scheduled hours</p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">Review or correct extracted shifts</summary>
            <fieldset disabled={exporting}>
            <div className="mt-3 max-h-[450px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Extracted working shifts; editable before download</caption>
                <thead><tr><th className="p-2">Employee</th><th className="p-2">Day</th><th className="p-2">Start</th><th className="p-2">End</th><th className="p-2"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{schedule.shifts.map(shift => <tr key={shift.id} className="border-t border-pp-line">
                  <td className="p-2"><input aria-label={`Employee for shift ${shift.id}`} className="w-full rounded border border-pp-line p-2" value={shift.employee} onChange={event => changeShift(shift.id, { employee: event.target.value })} /></td>
                  <td className="p-2"><select aria-label={`Day for ${shift.employee}`} className="rounded border border-pp-line p-2" value={shift.day} onChange={event => changeShift(shift.id, { day: +event.target.value })}>{schedule.days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></td>
                  {(["start", "end"] as const).map(field => <td key={field} className="p-2"><input type="time" aria-label={`${field === "start" ? "Start" : "End"} time for ${shift.employee}, ${schedule.days[shift.day]}`} value={inputTime(shift[field])} onChange={event => { if (event.target.value) { const [h, m] = event.target.value.split(":").map(Number); changeShift(shift.id, { [field]: h * 60 + m }); } }} /></td>)}
                  <td className="p-2"><button type="button" className="text-red-700 underline" aria-label={`Remove ${shift.employee}, ${schedule.days[shift.day]}`} onClick={() => changeShifts(schedule.shifts.filter(item => item.id !== shift.id))}>Remove</button></td>
                </tr>)}</tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => changeShifts([...schedule.shifts, { id: crypto.randomUUID(), employee: "", day: 0, start: 360, end: 720 }])}>Add shift</Button>
            </fieldset>
          </details>
          {validation && <p role="alert" className="mt-4 text-sm text-red-700">{validation}</p>}
        </section>
        {rows.length > 0 && <section aria-labelledby="coverage-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
            <div><h2 id="coverage-heading" className="font-semibold">Staffing by hour</h2><p className="text-sm text-gray-500">One landscape page, using larger paper when needed for readability.</p></div>
            <Button type="button" disabled={!reviewed || exporting || busy || !!validation} onClick={() => void download()}>{exporting ? "Creating PDF…" : "Download landscape PDF"}</Button>
          </div>
          <label className="mb-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked the shifts, dates, and review notes against the source schedule.</label>
          <div className="overflow-x-auto rounded-xl border border-pp-line bg-white">
            <table className="w-full min-w-[1050px] text-left text-xs">
              <caption className="sr-only">Weekly staffing coverage with employee count in every time interval</caption>
              <thead><tr className="bg-pp-mint/40"><th scope="col" className="w-36 p-3">Time</th>{schedule.days.map(day => <th key={day} scope="col" className="p-3">{day}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.start} className="border-t border-pp-line even:bg-gray-50">
                <th scope="row" className="whitespace-nowrap p-3 align-top font-medium">{clockLabel(row.start)} – {clockLabel(row.end)}</th>
                {row.employees.map((employees, day) => <td key={day} className="border-l border-pp-line p-3 align-top"><span className="mb-1 block font-semibold">{employees.length} on duty</span><span className="text-gray-600">{employees.join("; ") || "—"}</span></td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </section>}
      </>}
    </div>
  );
}
