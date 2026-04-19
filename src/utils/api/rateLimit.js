/**
 * Simple in-memory rate limiter for Next.js API routes.
 *
 * Uses a sliding-window counter per IP. Not suitable for multi-instance
 * deployments without an external store, but sufficient for single-process
 * Next.js dev / preview deployments.
 *
 * @param {Object} options
 * @param {number} options.windowMs  — Window size in milliseconds (default: 60 000)
 * @param {number} options.maxRequests — Max requests per window (default: 15)
 * @returns {function(Request): {limited: boolean, remaining: number}}
 */
export function createRateLimiter({ windowMs = 60_000, maxRequests = 15 } = {}) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const store = new Map()

  // Housekeeping: purge expired entries every 2× window to avoid memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key)
    }
  }, windowMs * 2)
  // Allow Node to exit even if the timer is still running
  if (cleanupInterval.unref) cleanupInterval.unref()

  /**
   * Check rate limit for the given request.
   *
   * @param {Request} request
   * @returns {{ limited: boolean, remaining: number }}
   */
  return function check(request) {
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1'
    const now = Date.now()

    let entry = store.get(ip)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(ip, entry)
    }

    entry.count += 1
    const remaining = Math.max(0, maxRequests - entry.count)

    return { limited: entry.count > maxRequests, remaining }
  }
}
