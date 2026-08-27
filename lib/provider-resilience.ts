import { RateLimitError } from "@/lib/google-books";

/** One failed provider attempt, kept for logging and error-page choice. */
export type ProviderFailure = {
  /** Provider or step that failed ("openlibrary", "isbndb-enrichment", …). */
  provider: string;
  /** External book id being resolved. */
  id: string;
  status?: number;
  message: string;
  /** 429 / 5xx / timeout / network — worth a retry and a "come back soon" page. */
  transient: boolean;
  attempt: number;
};

const TRANSIENT_MESSAGE_PATTERN =
  /(abort|timeout|timed out|socket hang up|network|fetch failed|econnreset|enotfound|eai_again|etimedout|econnrefused)/i;

/** Pull an HTTP status out of provider errors like "Open Library API error: 503". */
function statusFromError(error: unknown): number | undefined {
  if (error instanceof RateLimitError) return error.status;

  const withStatus = error as { status?: unknown; statusCode?: unknown };
  for (const value of [withStatus?.status, withStatus?.statusCode]) {
    if (typeof value === "number" && value >= 100 && value <= 599) {
      return value;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/\b(4\d{2}|5\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

export function classifyProviderError(error: unknown): {
  status?: number;
  message: string;
  transient: boolean;
} {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  const status = statusFromError(error);

  const transient =
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    TRANSIENT_MESSAGE_PATTERN.test(message);

  return { status, message: message || "Unknown provider error", transient };
}

/** Short budget for page-level external fetches on `/` and `/browse`. */
export const PAGE_FETCH_TIMEOUT_MS = 5000;

/** Wall-clock budget so one request cannot exceed Netlify / serverless limits. */
export type Deadline = {
  startedAt: number;
  budgetMs: number;
  remaining: () => number;
  expired: () => boolean;
  /**
   * Cap a step timeout to remaining budget, keeping `reserveMs` for response
   * assembly. Returns 0 when the deadline is already exhausted.
   */
  cap: (desiredMs: number, reserveMs?: number) => number;
};

export function createDeadline(budgetMs: number): Deadline {
  const startedAt = Date.now();
  return {
    startedAt,
    budgetMs,
    remaining: () => Math.max(0, budgetMs - (Date.now() - startedAt)),
    expired: () => Date.now() - startedAt >= budgetMs,
    cap(desiredMs: number, reserveMs = 250) {
      const left = Math.max(0, budgetMs - (Date.now() - startedAt) - reserveMs);
      if (left <= 0) return 0;
      return Math.min(desiredMs, left);
    },
  };
}

/** Structured timeout log — used to diagnose which provider burned the budget. */
export function logProviderTimeout(
  provider: string,
  timeoutMs: number,
  extra?: Record<string, unknown>
) {
  console.warn("[provider-timeout]", {
    provider,
    timeoutMs,
    ...extra,
  });
}

/** Reject a slow step so one hanging API cannot stall a whole page render. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  if (ms <= 0) {
    const error = new Error(`${label} timed out after 0ms (deadline exhausted)`);
    error.name = "TimeoutError";
    logProviderTimeout(label, 0);
    throw error;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} timed out after ${ms}ms`);
          error.name = "TimeoutError";
          logProviderTimeout(label, ms);
          reject(error);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Like `withTimeout`, but resolves to `fallback` instead of throwing. */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  fallback: T
): Promise<T> {
  try {
    return await withTimeout(promise, ms, label);
  } catch {
    return fallback;
  }
}

export type ProviderAttemptContext = {
  provider: string;
  id: string;
  /** Retries after the first attempt; only transient errors are retried. */
  retries?: number;
  retryDelayMs?: number;
  /** Per-attempt cap; the retry gets a longer budget than the first try. */
  timeoutMs?: number;
  onFailure?: (failure: ProviderFailure) => void;
};

/**
 * Run one provider lookup with a short retry for transient errors.
 * Never throws: a failed lookup resolves to null so callers can fall back to
 * another source instead of taking down the page.
 */
export async function withProviderRetry<T>(
  context: ProviderAttemptContext,
  run: (attempt: number) => Promise<T>
): Promise<T | null> {
  const {
    provider,
    id,
    retries = 1,
    retryDelayMs = 300,
    timeoutMs,
    onFailure,
  } = context;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const call = run(attempt);
      // Later attempts get a longer budget — most failures here are slow APIs.
      // Cap retries: first attempt only when under tight Netlify budgets.
      const attemptTimeout =
        timeoutMs == null
          ? undefined
          : attempt === 1
            ? timeoutMs
            : Math.min(timeoutMs * attempt, timeoutMs + 1500);
      return attemptTimeout
        ? await withTimeout(call, attemptTimeout, `${provider} lookup`)
        : await call;
    } catch (error) {
      const { status, message, transient } = classifyProviderError(error);
      const failure: ProviderFailure = {
        provider,
        id,
        status,
        message,
        transient,
        attempt,
      };
      onFailure?.(failure);
      console.error("[provider] lookup failed:", failure);

      const canRetry = transient && attempt <= retries;
      if (!canRetry) return null;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  return null;
}

/**
 * Best-effort secondary step (enrichment, tagging, cache write).
 * Failures and timeouts keep the current value instead of failing the page.
 */
export async function softStep<T>(
  context: {
    provider: string;
    id: string;
    timeoutMs?: number;
    onFailure?: (failure: ProviderFailure) => void;
  },
  fallback: T,
  run: () => Promise<T>
): Promise<T> {
  const { provider, id, timeoutMs = 2500, onFailure } = context;
  try {
    return await withTimeout(run(), timeoutMs, `${provider} step`);
  } catch (error) {
    const { status, message, transient } = classifyProviderError(error);
    const failure: ProviderFailure = {
      provider,
      id,
      status,
      message,
      transient,
      attempt: 1,
    };
    onFailure?.(failure);
    console.error("[provider] optional step failed:", failure);
    return fallback;
  }
}

/** Compact one-line summary for server logs / debugging a failing id. */
export function summarizeFailures(failures: readonly ProviderFailure[]): string {
  if (failures.length === 0) return "none";
  return failures
    .map(
      (failure) =>
        `${failure.provider}${failure.status ? `:${failure.status}` : ""}` +
        `${failure.transient ? "(transient)" : ""}`
    )
    .join(", ");
}
