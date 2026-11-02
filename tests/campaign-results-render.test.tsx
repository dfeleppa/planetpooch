import { LeadFollowUpList } from "../src/app/(marketing)/marketing/ad-reporting/LeadFollowUpList";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CampaignResultsReport } from "../src/app/(marketing)/marketing/ad-reporting/CampaignResultsReport";

test("campaign results render as one primary report table with honest loading values", () => {
  const outcomes: Parameters<typeof CampaignResultsReport>[0]["outcomes"] = {
    campaigns: [{ source: "meta", campaignId: "daycare", campaignName: "Daycare", leads: 2, bookedLeads: 1, appointments: 1, netPaidCents: 10000 }],
    leads: [], isAdmin: false, linkedSubmissions: 2, linkedCustomers: 2,
    duplicateProfileLeads: 0, totalBookedLeads: 1, totalBooked: 1, totalNetPaidCents: 10000,
    appointmentsAvailable: true, orderDataAvailable: true, incomplete: false,
    appointmentSyncedAt: null, appointmentUpdatedAt: null, orderSyncedAt: null,
  };
  const markup = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} as never },
    createElement(CampaignResultsReport, {
      from: "2026-10-01", to: "2026-10-15", source: "all", rangeLabel: "Oct 1–15", outcomes,
    })));

  assert.equal((markup.match(/<table\b/g) ?? []).length, 1);
  assert.match(markup, /Website forms/);
  assert.match(markup, /MoeGo linked/);
  assert.match(markup, /Net paid after lead/);
  assert.match(markup, /Daycare/);
  assert.match(markup, /Loading spend and website forms/);
});


test("follow-up hides unknown booking data instead of flagging customers", () => {
  const outcomes = { leads: [{ id: "a", customer: "Test Customer", booked: 0, pending: 0, receivedAt: "2026-10-01", business: "Pet Resort", source: "meta", services: [] }], appointmentsAvailable: false } as never;
  const markup = renderToStaticMarkup(createElement(LeadFollowUpList, { outcomes }));
  assert.match(markup, /Booking data is unavailable/);
  assert.doesNotMatch(markup, /Test Customer/);
});

test("follow-up excludes booked inquiries and displays pending status and contacts", () => {
  const base = { receivedAt: "2026-10-01", business: "Pet Resort", source: "meta", services: ["Daycare"], phone: "5551234567", email: "example@example.com", moegoCustomerId: "123" };
  const outcomes = { leads: [{ ...base, id: "a", customer: "Pending Customer", booked: 0, pending: 1 }, { ...base, id: "b", customer: "Booked Customer", booked: 1, pending: 0 }], appointmentsAvailable: true } as never;
  const markup = renderToStaticMarkup(createElement(LeadFollowUpList, { outcomes }));
  assert.match(markup, /Pending Customer/);
  assert.match(markup, /Pending appointment/);
  assert.match(markup, /tel:5551234567/);
  assert.doesNotMatch(markup, /Booked Customer/);
});
