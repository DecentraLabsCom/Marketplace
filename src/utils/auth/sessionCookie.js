/**
 * Opaque browser session cookie management.
 *
 * The cookie contains only a high-entropy server-session identifier. The SAML
 * assertion and identity claims are kept in the server-side session store.
 */
import {
  createServerSession,
  deleteServerSession,
  getServerSession,
  isServerSessionId,
  isServerSessionRenewalDue,
  renewServerSession,
} from './sessionStore'
import {
  MARKETPLACE_SESSION_TTL_SECONDS,
  resolveSessionTtlSeconds,
} from './sessionConfig'
import { registerSamlSessionBinding } from './samlSessionStateStore'

const COOKIE_NAME = '__Host-user_session'

export function getSessionCookieOptions(maxAgeSec = MARKETPLACE_SESSION_TTL_SECONDS) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec,
  }
}

/**
 * Creates one opaque cookie and persists the complete session server-side.
 */
export async function createSessionCookie(sessionData, maxAgeSec = MARKETPLACE_SESSION_TTL_SECONDS) {
  const { sessionId, ttlSeconds } = await createServerSession(sessionData, maxAgeSec)
  return [{
    ...getSessionCookieOptions(ttlSeconds),
    value: sessionId,
  }]
}

function getCookieValues(cookieStore) {
  if (!cookieStore) return []
  if (cookieStore.getAll) {
    const all = cookieStore.getAll()
    const values = all.filter((cookie) => cookie.name === COOKIE_NAME && cookie.value)
    if (values.length > 1) return null
    return values.map((cookie) => cookie.value)
  }
  const value = cookieStore.get?.(COOKIE_NAME)?.value
  return value ? [value] : []
}

export async function getSessionFromCookies(cookieStore, { renew = true } = {}) {
  const values = getCookieValues(cookieStore)
  if (values === null || values.length !== 1 || !isServerSessionId(values[0])) return null
  const session = await getServerSession(values[0])
  if (!session || !renew || typeof cookieStore?.set !== 'function') return session

  const renewalTime = Date.now()
  if (!isServerSessionRenewalDue(session, renewalTime)) return session

  let renewedSession
  try {
    const samlNameId = String(session.samlNameId || '').trim()
    const samlSessionIndex = String(session.samlSessionIndex || '').trim()
    const renewalTtlSeconds = resolveSessionTtlSeconds(
      session,
      MARKETPLACE_SESSION_TTL_SECONDS,
      renewalTime,
    )
    if (renewalTime + renewalTtlSeconds * 1000 <= Number(session.expiresAt)) return session
    if (samlNameId && samlSessionIndex) {
      await registerSamlSessionBinding({
        sessionId: values[0],
        nameId: samlNameId,
        sessionIndex: samlSessionIndex,
        ttlSeconds: renewalTtlSeconds,
      })
    }
    renewedSession = await renewServerSession(values[0], session, renewalTime)
  } catch {
    // A renewal failure must not turn an otherwise valid session into a logout.
    // The SAML binding is refreshed before the session so a partial renewal
    // cannot leave a live Marketplace session without a matching SLO index.
    return session
  }

  if (!renewedSession) return session

  const renewedTtlSeconds = Math.max(1, Math.floor((renewedSession.expiresAt - renewalTime) / 1000))
  const { name, ...cookieOptions } = getSessionCookieOptions(renewedTtlSeconds)
  cookieStore.set(name, renewedSession.sessionId, cookieOptions)
  return renewedSession
}

export function createDestroySessionCookie(name = COOKIE_NAME) {
  return {
    name,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}

export async function clearSessionCookies(cookieStore) {
  if (!cookieStore) return []

  const values = getCookieValues(cookieStore)
  if (values?.length === 1 && isServerSessionId(values[0])) {
    await deleteServerSession(values[0]).catch(() => {})
  }

  const names = new Set([COOKIE_NAME])
  cookieStore.getAll?.().forEach((cookie) => {
    if (cookie.name.startsWith(`${COOKIE_NAME}.`)) names.add(cookie.name)
  })

  const cleared = []
  names.forEach((name) => {
    const destroy = createDestroySessionCookie(name)
    cookieStore.set?.(destroy.name, destroy.value, {
      maxAge: destroy.maxAge,
      path: destroy.path,
      httpOnly: destroy.httpOnly,
      secure: destroy.secure,
      sameSite: destroy.sameSite,
    })
    cookieStore.delete?.(name)
    cleared.push(name)
  })
  return cleared
}

export const SESSION_COOKIE_NAME = COOKIE_NAME

export default {
  createSessionCookie,
  createDestroySessionCookie,
  getSessionFromCookies,
  getSessionCookieOptions,
  clearSessionCookies,
  SESSION_COOKIE_NAME,
}
