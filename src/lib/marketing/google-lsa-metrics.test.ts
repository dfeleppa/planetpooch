import assert from "node:assert/strict";
import test from "node:test";
import { isLsaCampaign, lsaSpendCents, normalizeLsaCalls, type LsaLeadRow } from "./google-lsa-metrics";

test("LSA classification separates standalone and LSA Performance Max from regular ads", () => {
  assert.equal(isLsaCampaign({ campaign: { advertisingChannelType: "LOCAL_SERVICES" } }), true);
  assert.equal(isLsaCampaign({ campaign: { advertisingChannelType: "PERFORMANCE_MAX", pmaxCampaignSettings: { localServicesEnabled: true } } }), true);
  assert.equal(isLsaCampaign({ campaign: { advertisingChannelType: "SEARCH" } }), false);
  assert.equal(isLsaCampaign({ campaign: { advertisingChannelType: "PERFORMANCE_MAX" } }), false);
});
test("actual spend sums micros before rounding, accepts zero, and rejects bad values", () => {
  assert.equal(lsaSpendCents([{ metrics: { costMicros: "1234567" } }, { metrics: { costMicros: "1234567" } }]), 247);
  assert.equal(lsaSpendCents([]), 0);
  assert.throws(() => lsaSpendCents([{ metrics: { costMicros: "invalid" } }]));
  assert.throws(() => lsaSpendCents([{ metrics: { costMicros: "99999999999999999999" } }]));
});
const lead = (id: string): LsaLeadRow => ({ localServicesLead: {
  resourceName: `customers/1234567890/localServicesLeads/${id}`, campaign: "customers/1234567890/campaigns/12",
  creationDateTime: "2026-11-08 23:59:59", leadType: "PHONE_CALL", contactDetails: { phoneNumber: "+15555550100" }, leadCharged: true,
} });
test("call IDs deduplicate pages but preserve separate calls from the same phone and day", () => {
  const rows = normalizeLsaCalls([lead("1"), lead("1"), lead("2")], new Set(["12"]), "2026-11-02", "2026-11-08");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].leadReceived, "2026-11-08");
  assert.equal(rows[0].chargeStatus, "Charged");
});
test("unmapped and out-of-period calls fail instead of silently losing data", () => {
  assert.throws(() => normalizeLsaCalls([lead("1")], new Set(["99"]), "2026-11-02", "2026-11-08"));
  assert.throws(() => normalizeLsaCalls([lead("1")], new Set(["12"]), "2026-11-02", "2026-11-07"));
});
test("wiped contact details remain countable and credited calls are labeled", () => {
  const row = lead("1");
  row.localServicesLead!.contactDetails = undefined;
  row.localServicesLead!.creditDetails = { creditState: "CREDITED" };
  const [call] = normalizeLsaCalls([row], new Set(["12"]), "2026-11-02", "2026-11-08");
  assert.equal(call.customer, null);
  assert.equal(call.chargeStatus, "Credited");
});
