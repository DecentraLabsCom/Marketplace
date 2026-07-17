import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

export const FMU_CONTEXT_COOKIE = 'marketplace_fmu_contexts'
const MAX_CONTEXTS = 6
const MAX_COOKIE_LENGTH = 3800
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const USER_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/

function encryptionKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required for FMU session storage')
  }
  const effective = secret || 'dev-only-session-secret-not-for-production-use-32chars'
  if (effective.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters long')
  return createHash('sha256').update(effective).digest()
}

function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
}

function decrypt(value) {
  try {
    const encoded = String(value || '')
    if (!encoded || encoded.length % 4 === 1 || !BASE64URL_PATTERN.test(encoded)) return []
    const packed = Buffer.from(encoded, 'base64url')
    if (packed.toString('base64url') !== encoded) return []
    if (packed.length <= 28) return []
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12))
    decipher.setAuthTag(packed.subarray(12, 28))
    const plaintext = Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()])
    const parsed = JSON.parse(plaintext.toString('utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function rawCookie(request, name) {
  const header = request?.headers?.get?.('cookie') || ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function createFmuUserBinding(session) {
  const id = String(session?.id || '').trim()
  const email = String(session?.email || '').trim().toLowerCase()
  const identity = id ? `id\0${id}` : email ? `email\0${email}` : ''
  if (!identity) throw new Error('Marketplace session identity is required for FMU access')
  return createHmac('sha256', encryptionKey())
    .update('marketplace-fmu-user-binding\0')
    .update(identity)
    .digest('base64url')
}

function activeContexts(contexts, now = Math.floor(Date.now() / 1000)) {
  return contexts.filter((item) => (
    item
    && Number(item.expiresAt) > now
    && /^[A-Za-z0-9_-]{16,512}$/.test(String(item.resourceSessionId || ''))
    && item.gatewayOrigin
    && USER_BINDING_PATTERN.test(String(item.userBinding || ''))
  ))
}

function contextKey(context) {
  const reservationKey = String(context.reservationKey || '').trim().toLowerCase()
  return reservationKey || `lab:${String(context.labId || '').trim()}`
}

export function readFmuContexts(request) {
  return activeContexts(decrypt(rawCookie(request, FMU_CONTEXT_COOKIE)))
}

export function encodeFmuContexts(existing, context) {
  const key = contextKey(context)
  const userBinding = String(context.userBinding || '')
  if (!USER_BINDING_PATTERN.test(userBinding)) {
    throw new Error('A valid Marketplace identity binding is required for FMU session storage')
  }
  let contexts = activeContexts(existing).filter((item) => (
    item.userBinding === userBinding && contextKey(item) !== key
  ))
  contexts.unshift({
    labId: String(context.labId || ''),
    reservationKey: String(context.reservationKey || ''),
    gatewayOrigin: new URL(context.gatewayOrigin).origin,
    resourceSessionId: String(context.resourceSessionId || ''),
    expiresAt: Number(context.expiresAt),
    userBinding,
  })
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(contexts[0].resourceSessionId)) {
    throw new Error('A valid FMU resource session is required for storage')
  }
  contexts = contexts.slice(0, MAX_CONTEXTS)
  let encoded = encrypt(contexts)
  while (encoded.length > MAX_COOKIE_LENGTH && contexts.length > 1) {
    contexts.pop()
    encoded = encrypt(contexts)
  }
  if (encoded.length > MAX_COOKIE_LENGTH) throw new Error('FMU session context exceeds cookie limits')
  return { encoded, contexts }
}

export function findFmuContext(request, { labId, reservationKey, gatewayOrigin, userBinding }) {
  const expectedUserBinding = String(userBinding || '')
  if (expectedUserBinding && !USER_BINDING_PATTERN.test(expectedUserBinding)) return null
  let expectedOrigin
  try {
    expectedOrigin = new URL(gatewayOrigin).origin
  } catch {
    return null
  }
  const expectedReservation = String(reservationKey || '').trim().toLowerCase()
  const matches = readFmuContexts(request).filter((item) => {
    if (expectedUserBinding && item.userBinding !== expectedUserBinding) return false
    let itemOrigin
    try {
      itemOrigin = new URL(item.gatewayOrigin).origin
    } catch {
      return false
    }
    if (itemOrigin !== expectedOrigin) return false
    if (String(item.labId) !== String(labId)) return false
    if (expectedReservation) {
      return String(item.reservationKey || '').trim().toLowerCase() === expectedReservation
    }
    return true
  })
  return matches.length === 1 ? matches[0] : null
}

export function fmuContextCookieOptions(contexts) {
  const now = Math.floor(Date.now() / 1000)
  const maxExpiry = Math.max(now + 1, ...contexts.map((item) => Number(item.expiresAt) || now + 1))
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: Math.max(1, maxExpiry - now),
  }
}

export function clearFmuContextCookie(cookieStore) {
  cookieStore.set(FMU_CONTEXT_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: 0,
  })
}
