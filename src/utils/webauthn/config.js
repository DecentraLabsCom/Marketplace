/**
 * WebAuthn configuration helpers.
 * Provides origin and RP-ID resolution for WebAuthn operations.
 */

/**
 * Resolves the expected origin from a Next.js request.
 * @param {Request} request
 * @returns {string}
 */
export function getOriginFromRequest(request) {
  const host = request?.headers?.get?.('host') || request?.headers?.host || 'localhost'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  return `${proto}://${host}`
}

/**
 * Resolves the RP-ID (relying party ID) from the request host.
 * @param {Request} request
 * @returns {string}
 */
export function getRpId(request) {
  const origin = getOriginFromRequest(request)
  try {
    return new URL(origin).hostname
  } catch {
    return 'localhost'
  }
}

export default { getOriginFromRequest, getRpId }
