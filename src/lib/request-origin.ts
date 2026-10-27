/** NextRequest.url may contain an internal host behind the deployment proxy. */
export function isSameOriginRequest(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return ["https:", "http:"].includes(url.protocol) && url.host === host.toLowerCase();
  } catch {
    return false;
  }
}
