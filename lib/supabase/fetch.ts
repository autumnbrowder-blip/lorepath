/**
 * Bounded fetch for every server-side Supabase call.
 *
 * Supabase requests previously used bare `fetch`, which has no timeout. When the
 * Auth service stops responding — the connection is accepted and the TLS handshake
 * completes, but no bytes ever come back — `fetch` waits indefinitely. Because
 * `middleware.ts` calls `supabase.auth.getUser()` on nearly every route, a single
 * unresponsive upstream stalls every request until the serverless function is
 * killed, and the whole site returns 500s.
 *
 * Bounding each request turns an upstream outage into a fast, local failure:
 * auth degrades to "signed out" and public pages keep rendering.
 */

/**
 * Data (PostgREST) calls. Generous enough for real queries, far below the
 * serverless execution limit so a stalled upstream never consumes the request.
 */
export const SUPABASE_TIMEOUT_MS = 6000;

/**
 * Auth calls in middleware. Tighter, because middleware runs before the page
 * does and its budget is shared with everything the page itself needs to do.
 */
export const SUPABASE_AUTH_TIMEOUT_MS = 3500;

/**
 * Run `fetch` with a hard deadline, honouring any caller-supplied AbortSignal.
 * On timeout the request is aborted and a descriptive Error is thrown, which
 * supabase-js surfaces as a retryable transport error rather than a hang.
 */
export async function timedFetch(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Keep the caller's own cancellation working (e.g. a disconnected client).
  const external = init.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Supabase request timed out after ${timeoutMs}ms (upstream did not respond).`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * True when an auth error means "the service did not answer" rather than
 * "this user is not signed in".
 *
 * The distinction matters: a genuine signed-out response should be trusted,
 * but a transport failure must not be mistaken for a definitive answer about
 * who the visitor is.
 */
export function isAuthServiceUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const { name, status } = error as { name?: unknown; status?: unknown };

  const errorName = typeof name === "string" ? name : "";
  if (
    errorName === "AuthRetryableFetchError" ||
    errorName === "AbortError" ||
    errorName === "TimeoutError" ||
    errorName === "TypeError" // fetch transport failure
  ) {
    return true;
  }

  const httpStatus = typeof status === "number" ? status : 0;
  // 0 = never reached the server; 408/429/5xx = reached it but got no usable answer.
  return httpStatus === 0 || httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
}
