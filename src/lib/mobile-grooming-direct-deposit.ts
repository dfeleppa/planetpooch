import { normalizeEmployeeName } from "./payroll";

// MoeGo appointment names differ from the names used in earlier payroll imports.
// Keep these explicit: fuzzy matching must never assign someone else's deposit.
const PAYROLL_NAMES: Record<string, string> = {
  "andrea lignowski": "Andrea M Lignowski",
  "arielle schroder": "Arielle T Schroder",
  "debbie vesce": "Debrah R Vesce",
  "dyana mcwherter": "Dyana Mcwheter",
  "jennifer fischer": "Jennifer A Fischer",
  "stephanie elezi": "Stephanie A Elezi",
};

export function directDepositEmployeeName(name: string): string {
  const normalized = normalizeEmployeeName(name);
  return PAYROLL_NAMES[normalized.toLocaleLowerCase()] ?? normalized;
}

export function directDepositEmployeeKey(name: string): string {
  return directDepositEmployeeName(name).toLocaleLowerCase();
}

/** Input is ordered by effective week descending, then most recent edit. */
export function latestDirectDeposits<T extends { employeeName: string; amountCents: number }>(settings: T[]): T[] {
  const latest = new Map<string, T>();
  for (const setting of settings) {
    const key = directDepositEmployeeKey(setting.employeeName);
    if (!latest.has(key)) latest.set(key, setting);
  }
  return Array.from(latest.values());
}
