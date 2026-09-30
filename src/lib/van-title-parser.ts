export type VanTitleFields = { year?: number; make?: string; model?: string; vin?: string };

export function parseVanTitle(text: string): VanTitleFields {
  const lines = text.toUpperCase().split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim());
  const value = (label: RegExp) => {
    const line = lines.find(line => label.test(line));
    return line?.replace(label, "").replace(/^[\s:.-]+/, "").trim() || "";
  };
  const rawVin = value(/^(?:VEHICLE IDENTIFICATION NUMBER|VEHICLE ID(?:ENTIFICATION)?(?: NO| NUMBER)?|VIN)\b/i).replace(/[^A-Z0-9]/g, "");
  const vin = /^[A-HJ-NPR-Z0-9]{17}$/.test(rawVin) ? rawVin : undefined;
  const rawYear = value(/^(?:MODEL )?YEAR\b/i).match(/\b(19\d{2}|20\d{2})\b/)?.[1];
  const year = rawYear ? Number(rawYear) : undefined;
  const clean = (raw: string) => raw.match(/^[A-Z0-9][A-Z0-9 .-]{0,98}/)?.[0].trim();
  const make = clean(value(/^(?:VEHICLE )?MAKE\b/i));
  const model = clean(value(/^(?:VEHICLE )?MODEL\b/i));
  return { ...(year && { year }), ...(make && { make }), ...(model && { model }), ...(vin && { vin }) };
}
