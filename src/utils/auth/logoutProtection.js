import { createHmac, timingSafeEqual } from 'node:crypto'

function logoutSecret() {
  const configured = process.env.LOGOUT_CSRF_SECRET
    || process.env.SESSION_ENCRYPTION_KEY
    || process.env.SESSION_SECRET
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('A logout CSRF secret is required in production')
  }
  return configured || 'dev-only-logout-csrf-secret-not-for-production'
}

export function createLogoutNonce(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null
  return createHmac('sha256', logoutSecret())
    .update('marketplace-logout\0')
    .update(sessionId)
    .digest('base64url')
}

export function isValidLogoutNonce(sessionId, providedNonce) {
  const expected = createLogoutNonce(sessionId)
  if (!expected || typeof providedNonce !== 'string') return false
  const actual = Buffer.from(providedNonce)
  const expectedBytes = Buffer.from(expected)
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes)
}
