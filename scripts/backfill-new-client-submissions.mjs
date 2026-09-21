import { PrismaClient } from "@prisma/client";

const ledgerSecret = process.env.NEW_CLIENT_LEDGER_SECRET?.trim();
const ledgerUrl = process.env.NEW_CLIENT_LEDGER_URL?.trim() || "https://app.planet-pooch.com/api/marketing/website-attribution/submissions";
const prisma = ledgerSecret ? null : new PrismaClient();
const API = "https://openapi.moego.pet/v1";
const START = "2026-09-18T00:00:00.000Z";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const headers = {
  Authorization: `Basic ${required("MOEGO_API_KEY")}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};
const companyId = required("MOEGO_COMPANY_ID");

async function post(path, body) {
  const response = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function saveLedger(body) {
  const response = await fetch(ledgerUrl, { method: "POST", headers: {
    Authorization: `Bearer ${ledgerSecret}`, "Content-Type": "application/json",
  }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Ledger returned ${response.status}`);
}

function parseNote(content) {
  if (!content?.includes("Website new client inquiry")) return null;
  const submissionId = content.match(/Submission:\s*([\da-f-]{36})/i)?.[1];
  if (!submissionId) return null;
  const services = content.match(/Services:\s*(.*)/i)?.[1]?.trim();
  const consent = content.match(/Marketing SMS\/email consent:\s*(Yes|No)/i)?.[1]?.toLowerCase() === "yes";
  const received = content.match(/Received:\s*(.*)/i)?.[1]?.trim();
  const attribution = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    const value = content.match(new RegExp(`^${key}:\\s*(.*)$`, "im"))?.[1]?.trim();
    if (value) attribution[key] = value;
  }
  return { submissionId, services: services && services !== "Not selected" ? services.split(",").map((v) => v.trim()).filter(Boolean) : [], consent, received, attribution };
}

let pageToken = "1";
const leads = [];
do {
  const page = await post("/leads:list", { companyId, businessIds: ["biz3pcO", "bizVdfk"],
    filter: { lastUpdatedTime: { startTime: START, endTime: new Date().toISOString() } },
    pagination: { pageSize: 500, pageToken } });
  leads.push(...(page.leads ?? []));
  pageToken = page.nextPageToken || "";
} while (pageToken);

let matched = 0;
let inserted = 0;
let existing = 0;
for (const lead of leads) {
  let found = null;
  let firstPet = null;
  for (const pet of lead.pets ?? []) {
    if (!pet.id || !pet.customerId) continue;
    const notes = await post(`/customers/${encodeURIComponent(pet.customerId)}/pets/${encodeURIComponent(pet.id)}/notes:list`,
      { customerId: pet.customerId, id: pet.id, pagination: { pageSize: 100, pageToken: "1" } });
    for (const note of notes.notes ?? []) {
      const parsed = parseNote(note.content);
      if (parsed) { found = parsed; firstPet = pet; break; }
    }
    if (found) break;
  }
  if (!found) continue;
  matched++;
  const pets = (lead.pets ?? []).map((pet) => ({ name: pet.name ?? "", breed: pet.breed ?? "", type: pet.type ?? "DOG" }));
  const payload = {
    firstName: lead.firstName ?? "", lastName: lead.lastName ?? "", phone: lead.phone ?? lead.mainPhoneNumber ?? "",
    email: lead.email ?? "", pets, services: found.services, marketingConsent: found.consent,
    submissionId: found.submissionId, attribution: found.attribution,
  };
  const receivedAt = found.received && !Number.isNaN(Date.parse(found.received)) ? new Date(found.received) : new Date(lead.createdTime);
  if (ledgerSecret) {
    await saveLedger({ action: "received", submissionId: found.submissionId, formKey: "new-client-v1",
      receivedAt: receivedAt.toISOString(), payload, requestMetadata: { source: "moego_historical_backfill" } });
    await saveLedger({ action: "status", submissionId: found.submissionId, status: "SYNCED", httpStatus: 200,
      message: "Reconstructed from the confirmed MoeGo lead and inquiry note",
      metadata: { source: "moego_historical_backfill" }, normalized: {
        firstName: payload.firstName, lastName: payload.lastName, phone: payload.phone, email: payload.email,
        pets, services: found.services, marketingConsent: found.consent, attribution: found.attribution,
      }, moegoLeadId: lead.id, moegoCustomerId: firstPet?.customerId ?? null, moegoPetId: firstPet?.id ?? null });
    inserted++;
    continue;
  }
  const result = await prisma.websiteFormSubmission.upsert({
    where: { id: found.submissionId },
    create: { id: found.submissionId, company: "RESORT", formKey: "new-client-v1", receivedAt,
      payload, requestMetadata: { source: "moego_historical_backfill" }, firstName: payload.firstName,
      lastName: payload.lastName, phone: payload.phone, email: payload.email, pets, services: found.services,
      marketingConsent: found.consent, attribution: found.attribution, status: "SYNCED", lastHttpStatus: 200,
      moegoLeadId: lead.id, moegoCustomerId: firstPet?.customerId ?? null, moegoPetId: firstPet?.id ?? null,
      moegoSyncedAt: receivedAt, attemptCount: 1 },
    update: {},
    select: { events: { where: { eventType: "HISTORICAL_BACKFILL" }, select: { id: true } } },
  });
  if (result.events.length) { existing++; continue; }
  await prisma.websiteFormSubmissionEvent.create({ data: {
    submissionId: found.submissionId, eventType: "HISTORICAL_BACKFILL", status: "SYNCED", httpStatus: 200,
    message: "Reconstructed from the confirmed MoeGo lead and inquiry note",
    metadata: { payload, source: "moego_historical_backfill" },
  } });
  inserted++;
}

console.log(JSON.stringify({ leadsScanned: leads.length, exactFormRecords: matched, inserted, alreadyPresent: existing }));
if (prisma) await prisma.$disconnect();
