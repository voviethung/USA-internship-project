/**
 * Simple in-memory rate limiter.
 * Suitable for single-instance deployment (Vercel serverless).
 * For multi-instance, switch to Redis / Upstash.
 */

const store = new Map<string, number[]>();

/**
 * Check if a request is allowed under the rate limit.
 * @param identifier  Unique key (e.g. IP address)
 * @param maxRequests Max requests in the window (default 10)
 * @param windowMs    Window size in ms (default 60 000 = 1 min)
 * @returns `true` if allowed, `false` if rate-limited
 */
export function checkRateLimit(
  identifier: string,
  maxRequests = 10,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const timestamps = store.get(identifier) ?? [];

  // Keep only timestamps within the current window
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= maxRequests) {
    store.set(identifier, valid);
    return false;
  }

  valid.push(now);
  store.set(identifier, valid);
  return true;
}
