export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// KPI values are stored as the display number scaled x100 (see src/lib/kpis.ts).
const CURRENCY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCurrency(scaled: number): string {
  return CURRENCY_FMT.format(scaled / 100);
}

export function formatPercent(scaled: number, decimals = 1): string {
  return `${(scaled / 100).toFixed(decimals)}%`;
}

export function formatKpiValue(
  scaled: number | null | undefined,
  format: "number" | "currency" | "percent",
): string {
  if (scaled === null || scaled === undefined) return "—";
  switch (format) {
    case "currency":
      return formatCurrency(scaled);
    case "percent":
      return formatPercent(scaled);
    default:
      return (scaled / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

export function extractTextFromTiptapJson(node: Record<string, unknown>): string {
  if (!node) return "";
  if (node.type === "text") return (node.text as string) || "";
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTiptapJson).join(" ");
  }
  return "";
}
