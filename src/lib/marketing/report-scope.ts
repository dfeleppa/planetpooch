export const BUSINESSES = [{ value: "all", label: "All businesses" }, { value: "pet-resort", label: "Pet Resort" }, { value: "mobile-grooming", label: "Mobile Grooming" }] as const;
export const SERVICES = [{ value: "all", label: "All services" }, { value: "boarding", label: "Boarding" }, { value: "daycare", label: "Daycare" }, { value: "grooming", label: "Grooming" }, { value: "training", label: "Training" }] as const;
export type ReportBusiness = typeof BUSINESSES[number]["value"];
export type ReportService = typeof SERVICES[number]["value"];
export type ReportScope = { business: ReportBusiness; service: ReportService };
export function reportScope(query: { business?: string | null; service?: string | null }): ReportScope {
  return { business: BUSINESSES.find((item) => item.value === query.business)?.value ?? "all", service: SERVICES.find((item) => item.value === query.service)?.value ?? "all" };
}
export function matchesService(services: string[], service: ReportService) {
  return service === "all" || services.some((value) => value.toLowerCase().includes(service));
}
export function matchesInquiryScope(row: { company: string; services: string[] }, scope: ReportScope) {
  return (scope.business === "all" || row.company === (scope.business === "pet-resort" ? "RESORT" : "GROOMING")) && matchesService(row.services, scope.service);
}
export function marketingViewUrl(query: Record<string, string | undefined>, view: string) {
  const params = new URLSearchParams();
  for (const key of ["days", "from", "to", "source", "business", "service", "compare", "compareFrom", "compareTo"]) if (query[key]) params.set(key, query[key]!);
  if (view !== "results") params.set("view", view);
  return `/marketing${params.size ? `?${params}` : ""}`;
}
