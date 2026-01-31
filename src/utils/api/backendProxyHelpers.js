/**
 * Shared utilities for institutional backend proxy endpoints
 * Used by API routes in /api/backend/intents/** to forward requests to institutional backends
 */
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import devLog from '@/utils/dev/logger'

/**
 * Resolves the backend URL from request parameters or environment
 * @param {Request} request - Next.js request object
 * @returns {string|null} Backend URL or null if not configured
 */
export function resolveBackendUrl(request) {
  const { searchParams } = request.nextUrl
  const override = searchParams.get('backendUrl')
  return override || process.env.INSTITUTION_BACKEND_URL || null
}

/**
 * Determines if the server should generate its own token instead of forwarding client token
 * @param {Request} request - Next.js request object
 * @returns {boolean} True if server should use its own token
 */
export function shouldUseServerToken(request) {
  const { searchParams } = request.nextUrl
  return searchParams.get('useServerToken') === '1'
}

/**
 * Resolves headers for forwarding to institutional backend
 * Handles authorization token (client or server-generated) and API key
 * @param {Request} request - Next.js request object
 * @returns {Promise<Object>} Headers object for backend request
 */
export async function resolveForwardHeaders(request) {
  const headers = { 'Content-Type': 'application/json' }
  
  // Handle authorization token
  const rawAuth = request.headers.get('authorization')
  const normalizedAuth = rawAuth && rawAuth.trim().length > 0 ? rawAuth.trim() : null
  const looksInvalid =
    !normalizedAuth ||
    /^bearer\s+null$/i.test(normalizedAuth) ||
    /^bearer\s+undefined$/i.test(normalizedAuth)
  
  if (normalizedAuth && !looksInvalid && !shouldUseServerToken(request)) {
    headers.Authorization = normalizedAuth
  } else {
    try {
      const backendAuth = await marketplaceJwtService.generateIntentBackendToken()
      headers.Authorization = `Bearer ${backendAuth.token}`
    } catch (error) {
      devLog.warn('[API] Failed to generate intent backend token for proxy', error)
    }
  }
  
  // Handle API key
  const apiKey = request.headers.get('x-api-key') || process.env.INSTITUTION_BACKEND_SP_API_KEY
  if (apiKey) {
    headers['x-api-key'] = apiKey
  }
  
  return headers
}
