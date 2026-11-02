import type { MoegoAppointmentRow, MoegoAppointmentServiceDetail } from "./client";

/** Count unique pets whose earliest completed grooming visit is in the KPI cohort. */
export function countFirstTimeGroomingPets(
  history: MoegoAppointmentRow[],
  cohort: MoegoAppointmentRow[],
  isGroomingService: (service: MoegoAppointmentServiceDetail) => boolean
): number {
  const firstVisits = new Map<string, { time: number; id: string }>();
  const appointments = new Map([...history, ...cohort].map(a => [a.id, a]));
  for (const appointment of appointments.values()) {
    if (appointment.isDeleted || appointment.noShow || appointment.status !== "FINISHED") continue;
    for (const petService of appointment.petServiceDetails ?? []) {
      if (!(petService.serviceDetails ?? []).some(isGroomingService)) continue;
      const petId = petService.pet?.id;
      const time = Date.parse(appointment.duration?.startTime ?? "");
      if (!petId || !Number.isFinite(time)) {
        throw new Error("Cannot determine first-time grooming without stable pet ID and visit date");
      }
      const previous = firstVisits.get(petId);
      if (!previous || time < previous.time || (time === previous.time && appointment.id < previous.id)) {
        firstVisits.set(petId, { time, id: appointment.id });
      }
    }
  }
  const cohortIds = new Set(cohort.map(a => a.id));
  return [...firstVisits.values()].filter(visit => cohortIds.has(visit.id)).length;
}
