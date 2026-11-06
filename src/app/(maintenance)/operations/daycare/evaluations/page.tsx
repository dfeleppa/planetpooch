import { requireAuth } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";
import { streamAppointments } from "@/lib/moego/client";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/daycare-weekly-report";

export const maxDuration = 300;

function validDate(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export default async function EvaluationsPage({ searchParams }: {
  searchParams: Promise<{ start?: string | string[]; end?: string | string[] }>;
}) {
  await requireAuth();
  if ((await getActiveBusiness()).company !== "RESORT") redirect("/maintenance");
  const params = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const start = validDate(params.start) ?? `${today.slice(0, 7)}-01`;
  const end = validDate(params.end) ?? today;
  // The extra day on either side covers Eastern daylight saving offsets.
  const from = new Date(`${start}T00:00:00Z`);
  const until = new Date(`${end}T00:00:00Z`);
  const rows: { key: string; pet: string; name: string; date: string; result: string; appointment: string }[] = [];
  let error: string | null = null;
  if (start > end || until.getTime() - from.getTime() > 92 * 86400000) {
    error = "Choose an end date on or after the start date and a range of up to 93 days.";
  } else {
    try {
      for await (const page of streamAppointments({ startTime: {
        startTime: from.toISOString(), endTime: new Date(until.getTime() + 2 * 86400000).toISOString(),
      } }, [PET_RESORT_BUSINESS_ID])) {
        for (const appointment of page) {
          if (appointment.isDeleted || appointment.status === "CANCELED") continue;
          const timestamp = appointment.duration?.startTime;
          if (!timestamp || !Number.isFinite(Date.parse(timestamp))) continue;
          const date = new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
          if (date < start || date > end) continue;
          for (const [petIndex, detail] of (appointment.petServiceDetails ?? []).entries()) {
            for (const [index, evaluation] of (detail.evaluationDetails ?? []).entries()) {
              // Match the daycare KPI service; training evaluations belong to Training.
              if (evaluation.name?.trim().toLowerCase() !== "evaluation") continue;
              rows.push({ key: `${appointment.id}-${petIndex}-${index}`, pet: detail.pet?.name || "Unknown pet",
                name: evaluation.name, date: timestamp,
                result: evaluation.status === "PASS" ? "Pass" : evaluation.status === "FAIL" ? "Fail" : "No result recorded",
                appointment: appointment.noShow ? "No show" : (appointment.status || "Unknown").replaceAll("_", " ").toLowerCase(),
              });
            }
          }
        }
      }
      rows.sort((a, b) => b.date.localeCompare(a.date));
    } catch (cause) {
      console.error("Daycare evaluations could not be loaded", cause);
      error = "Unable to load evaluations from MoeGo. Please try again.";
    }
  }
  return <div className="space-y-6">
    <div><h2 className="text-lg font-semibold text-gray-900">Evaluations</h2>
      <p className="mt-1 text-sm text-gray-500">Daycare evaluations and recorded results from MoeGo. Dates use Eastern time; canceled appointments are excluded.</p></div>
    <form className="flex flex-wrap items-end gap-4">
      <label className="text-sm">Start date<input className="mt-1 block rounded border p-2" type="date" name="start" defaultValue={start} required /></label>
      <label className="text-sm">End date<input className="mt-1 block rounded border p-2" type="date" name="end" defaultValue={end} required /></label>
      <button className="rounded bg-[#304b55] px-4 py-2 text-sm font-semibold text-white" type="submit">Refresh report</button>
    </form>
    {error ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : <>
      <p className="text-sm text-gray-600">{rows.length} evaluations · {rows.filter(row => row.result === "Pass").length} passed · {rows.filter(row => row.result === "Fail").length} failed · {rows.filter(row => row.result === "No result recorded").length} without a recorded result</p>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm">
        <thead className="bg-gray-50"><tr>{["Appointment date", "Pet", "Evaluation", "Result", "Appointment status"].map(label => <th key={label} scope="col" className="p-4 font-semibold">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} className="border-t"><td className="p-4">{new Date(row.date).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}</td><td className="p-4">{row.pet}</td><td className="p-4">{row.name}</td><td className="p-4">{row.result}</td><td className="p-4 capitalize">{row.appointment}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No daycare evaluations found for these dates.</td></tr>}</tbody>
      </table></div>
      <p className="text-xs text-gray-500">Results reflect MoeGo at the time this page loads. A missing result does not indicate a pass or fail.</p>
    </>}
  </div>;
}
