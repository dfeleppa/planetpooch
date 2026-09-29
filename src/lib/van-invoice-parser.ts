/** Best-effort fields from local OCR. Every field remains editable before saving. */
export function parseVanInvoice(text: string) {
  const value = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() || "";
  const money = (pattern: RegExp) => value(pattern).replace(/,/g, "");
  const rawDate = value(/\b(?:Date|Delivery Date)\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const dateParts = rawDate.split("/");
  const serviceDate = dateParts.length === 3
    ? `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}` : "";
  const item = value(/^\s*\d+(?:\.\d+)?\s+(.+?)\s+\$?[\d,]+\.\d{2}\s+\$?[\d,]+\.\d{2}\s*$/m);
  const description = /Final Bill/i.test(text) && /rear bumper|rear lamps|refinish/i.test(text)
    ? "Body and paint repair (see attached bill)"
    : item || value(/\b(New Battery|Oil Change|Tire Replacement|Brake Repair|Inspection)\b/i);
  const vendor = text.slice(0, 500).match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\s+(?:Service|Repair|Automotive|Garage))\b/)?.[1] || "";
  const cost = money(/\b(?:Grand|Net)\s+Total\s*[|:$~\s]*([\d,]+\.\d{2})/i)
    || money(/\b(?:Total|Totak)\s*[:$]?\s*\$?([\d,]+\.\d{2})/i)
    || money(/\bAmount\s*:\s*\$?([\d,]+\.\d{2})/i);
  return {
    serviceDate,
    vendor,
    invoiceNumber: value(/\b(?:Reference|Invoice\s*#)\s*[:#]?\s*([A-Z]{1,4}\s*-?\s*\d{4,})/i).replace(/\s+/g, ""),
    workOrderNumber: value(/\bWork\s*Order\s*#?\s*:\s*([A-Z0-9-]+)/i),
    description,
    category: /battery|repair|replacement/i.test(description) ? "Repair" : /oil/i.test(description) ? "Oil change" : /tire/i.test(description) ? "Tires" : "Other",
    cost,
    subtotal: money(/\bSubtotal\s*[:|]?\s*\$?([\d,]+\.\d{2})/i),
    tax: money(/\b(?:Sales\s+Tax|Taxes\/Fees)\s*[:|]?\s*\$?([\d,]+\.\d{2})/i),
    amountPaid: money(/\bAmount\s*:\s*\$?([\d,]+\.\d{2})/i),
    balanceDue: money(/\bInvoice\s+Balance\s*:\s*\$?([\d,]+\.\d{2})/i),
  };
}
