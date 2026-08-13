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
 * Data (PostgREST) calls. Generous enough for real queries, but low enough that
 * a middleware timeout plus a page timeout on a cold container still finishes
 * well inside the serverless execution limit.
 */
export const SUPABASE_TIMEOUT_MS = 5000;

/**
 * Auth calls in middleware. Tighter, because middleware runs before the page
 * does and its budget is shared with everything the page itself needs to do.
 */
export const SUPABASE_AUTH_TIMEOUT_MS = 3000;

/**
 * Browser calls (sign-in, sign-up, client-side queries). Longer than the
 * middleware budget because a person is waiting on a deliberate action and a
 * slow network should not cancel a genuine attempt — but still bounded, so a
 * dead upstream produces an error instead of a spinner that never resolves.
 */
export const SUPABASE_CLIENT_TIMEOUT_MS = 8000;

/**
 * Shown when auth cannot be reached. Deliberately distinguishes an outage from
 * a rejected credential, so people do not retype a correct password repeatedly
 * or assume their account was deleted.
 */
export const AUTH_UNAVAILABLE_MESSAGE =
  "Sign-in is temporarily unavailable — our authentication provider is not responding. This is not a problem with your account or password. Please try again shortly.";

/**
 * Circuit breaker.
 *
 * A timeout bounds a single request, but a page that makes several Supabase
 * calls pays that bound repeatedly: with a 6s timeout, four sequential calls to
 * a dead service still burn 24 seconds and blow the serverless execution limit.
 * The timeout alone therefore prevents an infinite hang but not an outage.
 *
 * After a transport failure, further calls to that service fail immediately for
 * a short cooldown, so an unresponsive upstream costs one timeout per cooldown
 * window rather than one per call. Recovery is automatic: the next request after
 * the cooldown is allowed through, and any success resets the breaker.
 *
 * It opens on the first failure rather than after several. The cost of being
 * wrong is small and self-correcting (one cooldown window of degraded auth),
 * while the cost of waiting is a request that exceeds the serverless execution
 * limit and returns nothing at all.
 *
 * State is per-instance, which is the correct granularity here — each
 * serverless container independently discovers and forgets the outage. Note
 * that middleware and page rendering run in separate runtimes, so each
 * maintains its own breaker and discovers the outage independently.
 */
const BREAKER_OPEN_AFTER_FAILURES = 1;
const BREAKER_COOLDOWN_MS = 20000;

type BreakerState = { failures: number; openedAt: number };
const breakers = new Map<string, BreakerState>();

/**
 * Group by service, not by full URL: a hung auth service must not stop
 * perfectly healthy database calls (and vice versa).
 */
function breakerKey(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  try {
    const url = new URL(raw);
    // "/auth/v1/token" -> "auth", "/rest/v1/books" -> "rest"
    const service = url.pathname.split("/").filter(Boolean)[0] ?? "root";
    return `${url.host}/${service}`;
  } catch {
    return "unknown";
  }
}

function breakerIsOpen(key: string): boolean {
  const state = breakers.get(key);
  if (!state || state.failures < BREAKER_OPEN_AFTER_FAILURES) return false;

  if (Date.now() - state.openedAt >= BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed — allow one probe through to test for recovery.
    breakers.delete(key);
    return false;
  }

  return true;
}

function recordFailure(key: string): void {
  const state = breakers.get(key) ?? { failures: 0, openedAt: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_OPEN_AFTER_FAILURES) {
    state.openedAt = Date.now();
  }
  breakers.set(key, state);
}

function recordSuccess(key: string): void {
  breakers.delete(key);
}

/** Transport failure, named so `isAuthServiceUnavailable` classifies it. */
function transportError(message: string): Error {
  const error = new Error(message);
  error.name = "TimeoutError";
  return error;
}

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
  const key = breakerKey(input);

  // Known-dead service: fail now rather than spending another full timeout.
  if (breakerIsOpen(key)) {
    throw transportError(
      "Supabase request skipped — the service is currently unresponsive."
    );
  }

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
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Any HTTP response means the service answered, even a 4xx/5xx.
    recordSuccess(key);
    return response;
  } catch (error) {
    if (timedOut) {
      recordFailure(key);
      throw transportError(
        `Supabase request timed out after ${timeoutMs}ms (upstream did not respond).`
      );
    }
    // Caller-initiated cancellation is not an upstream fault — do not count it.
    if (!external?.aborted) {
      recordFailure(key);
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

/**
 * Quick liveness probe for the auth service.
 *
 * OAuth sign-in navigates the browser straight to the provider authorize URL
 * and never issues a fetch, so there is nothing to time out. Without a probe,
 * an unresponsive auth service leaves the visitor staring at a blank page that
 * never resolves. Checking first lets the app say what is wrong on a page it
 * still controls.
 *
 * Any answer at all — including an error status — counts as reachable; the goal
 * is only to detect a service that never responds.
 */
export async function checkAuthReachable(
  supabaseUrl: string,
  anonKey: string,
  timeoutMs = 5000
): Promise<boolean> {
  try {
    await timedFetch(
      `${supabaseUrl}/auth/v1/health`,
      { headers: { apikey: anonKey } },
      timeoutMs
    );
    return true;
  } catch {
    return false;
  }
}
