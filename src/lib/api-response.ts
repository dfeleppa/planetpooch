const STATUS_ERRORS: Record<number, string> = {
  400: "The request could not be read. Check the entered details and try again.",
  401: "Your session has expired. Sign in again and retry.",
  403: "You do not have permission to perform this action.",
  404: "The requested item could not be found. Refresh the page and try again.",
  408: "The request timed out. Please try again.",
  409: "This item has changed or conflicts with an existing record. Refresh the page and try again.",
  413: "The upload or request is too large. Choose a smaller file or send fewer items at once.",
  415: "This file or request format is not supported. Choose a supported file type.",
  422: "Some details could not be processed. Check the entered details and try again.",
  429: "Too many requests. Wait a moment and try again.",
  500: "The server encountered an error. Please try again.",
  502: "The server could not reach an upstream service. Please try again shortly.",
  503: "The service is temporarily unavailable. Please try again shortly.",
  504: "The server took too long to respond. Refresh the page to check whether the action completed before retrying.",
};

/** Keep API validation errors; never show a JSON parser error or a proxy's HTML page.
 * Callers retain their own HTTP status handling (including conflict-specific flows).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Same boundary as Response.json(); callers type their payloads.
export async function readApiResponse(response: Response): Promise<any> {
  const fallback = STATUS_ERRORS[response.status] ?? `The request failed (HTTP ${response.status}). Please try again.`;
  if (response.status === 204) return {};
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) throw new Error(fallback);
    if (response.redirected) throw new Error("Your session may have expired. Sign in again and retry.");
    throw new Error("The server returned an unreadable response. Refresh the page to check whether the action completed before retrying.");
  }
  if (!response.ok) {
    const body = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    const error = "error" in body && typeof body.error === "string" && body.error.trim()
      ? body.error : fallback;
    return { ...body, error };
  }
  return data;
}
