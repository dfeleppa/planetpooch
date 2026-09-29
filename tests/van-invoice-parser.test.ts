import assert from "node:assert/strict";
import test from "node:test";
import { parseVanInvoice } from "../src/lib/van-invoice-parser";

test("extracts Van 6 invoice fields despite OCR noise", () => {
  const text = `_____zaCapital Tire Service ex |
Planet Pooch Date: 10/13/2025 PO Number:
Reference: LB26998 Work Order#:W-263350
1.00 New Battery 239.95 239.95
Lynnbrook - Taxable Subtotal: 239.95 5
New York State Sales Tax: 20.70
Terms: N/A = Totak $260.65
10/13/2025 Payment# P-263351 Amount: $260.65
Invoice Balance: $0.00`;
  const parsed = parseVanInvoice(text);
  assert.deepEqual({ date: parsed.serviceDate, vendor: parsed.vendor, invoice: parsed.invoiceNumber,
    workOrder: parsed.workOrderNumber, description: parsed.description, category: parsed.category,
    subtotal: parsed.subtotal, tax: parsed.tax, total: parsed.cost, paid: parsed.amountPaid, balance: parsed.balanceDue },
    { date: "2025-10-13", vendor: "Capital Tire Service", invoice: "LB26998", workOrder: "W-263350",
      description: "New Battery", category: "Repair", subtotal: "239.95", tax: "20.70",
      total: "260.65", paid: "260.65", balance: "0.00" });
});

test("extracts totals from the separate body repair bill's second page without inventing a service date or payment", () => {
  const text = `Final Bill
number: 3601
FORD Transit Van T-350 HD EL 148" WB High Roof 3D VAN 6
E01 REAR LAMPS
E01 Remove/Replace RT Tail lamp assy dual rear wheels
E01 REAR BUMPER
Subtotal 9,055.16 |
Sales Tax | 781.01 |
Net Total | | ~ 9,836.17 |
Balance due from Customer $: 9,836.17`;
  const parsed = parseVanInvoice(text);
  assert.equal(parsed.category, "Repair");
  assert.equal(parsed.description, "Body and paint repair (see attached bill)");
  assert.equal(parsed.subtotal, "9055.16");
  assert.equal(parsed.tax, "781.01");
  assert.equal(parsed.cost, "9836.17");
  assert.equal(parsed.serviceDate, "");
  assert.equal(parsed.amountPaid, "");
  assert.equal(parsed.balanceDue, "");
});
