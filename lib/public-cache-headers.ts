/**
 * Cache-Control for public, unauthenticated GET JSON.
 * Never use this for preferences, ratings-with-user, or auth session payloads.
 */
export function publicGetCacheHeaders(options: {
  authenticated: boolean;
  cacheable?: boolean;
  sMaxAge?: number;
}): HeadersInit {
  if (options.authenticated || options.cacheable === false) {
    return { "Cache-Control": "private, no-store" };
  }

  const sMaxAge = options.sMaxAge ?? 60;
  return {
    "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 5}`,
    Vary: "Authorization",
  };
}
