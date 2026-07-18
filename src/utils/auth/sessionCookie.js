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
} from './sessionStore'
import { MARKETPLACE_SESSION_TTL_SECONDS } from './sessionConfig'

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
  const { sessionId } = await createServerSession(sessionData, maxAgeSec)
  return [{
    ...getSessionCookieOptions(maxAgeSec),
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

export async function getSessionFromCookies(cookieStore) {
  const values = getCookieValues(cookieStore)
  if (values === null || values.length !== 1 || !isServerSessionId(values[0])) return null
  return getServerSession(values[0])
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
