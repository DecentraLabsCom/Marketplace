import devLog from '@/utils/dev/logger'

const DEFAULT_RP_NAME = 'DecentraLabs Marketplace'

/**
 * Resolve RP origin for WebAuthn operations from request/env.
 * @param {Request} request
 * @returns {string|undefined}
 */
export function getOriginFromRequest(request) {
  const envOrigin =
    process.env.WEBAUTHN_ORIGIN ||
    process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN ||
    process.env.NEXT_PUBLIC_BASE_URL

  if (envOrigin) return envOrigin

  try {
    const headerOrigin = request?.headers?.get?.('origin') || ''
    if (headerOrigin) return headerOrigin
    const host = request?.headers?.get?.('host')
    if (host) {
      const proto = host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https'
      return `${proto}://${host}`
    }
  } catch (error) {
    devLog.warn('[WebAuthn] Failed to resolve origin from request headers', error)
  }

  return undefined
}

/**
 * Resolve RP ID (hostname) for WebAuthn operations using NEXT_PUBLIC_BASE_URL.
 * @returns {string|undefined}
 */
export function getRpId() {
  const base = process.env.NEXT_PUBLIC_BASE_URL
  if (!base) {
    devLog.warn('[WebAuthn] NEXT_PUBLIC_BASE_URL is required to derive rpId')
    return undefined
  }

  try {
    const url = base.includes('://') ? new URL(base) : new URL(`https://${base}`)
    return url.hostname
  } catch (error) {
    devLog.warn('[WebAuthn] Failed to parse NEXT_PUBLIC_BASE_URL for rpId', error)
    return undefined
  }
}

/**
 * Get RP name for registration metadata.
 * @returns {string}
 */
export function getRpName() {
  return process.env.NEXT_PUBLIC_WEBAUTHN_RP_NAME || process.env.WEBAUTHN_RP_NAME || DEFAULT_RP_NAME
}

export default {
  getOriginFromRequest,
  getRpId,
  getRpName,
}
