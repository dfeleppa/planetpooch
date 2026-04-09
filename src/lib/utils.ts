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

export function extractTextFromTiptapJson(node: Record<string, unknown>): string {
  if (!node) return "";
  if (node.type === "text") return (node.text as string) || "";
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromTiptapJson).join(" ");
  }
  return "";
}
