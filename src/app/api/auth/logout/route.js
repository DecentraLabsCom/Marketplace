/**
 * Local session logout. State-changing logout is deliberately POST-only and
 * requires both same-origin evidence and a session-bound CSRF nonce.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { clearSessionCookies, getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { clearFmuContextCookie } from '@/utils/auth/fmuSessionStore'
import { revokeFmuContexts, revokeFmuContextsForSession } from '@/utils/auth/revokeFmuContexts'
import { clearSamlSessionBinding } from '@/utils/auth/samlSessionStateStore'
import { isValidLogoutNonce } from '@/utils/auth/logoutProtection'

function expectedOrigin(request) {
  const configured = process.env.NEXT_PUBLIC_BASE_URL || request.url
  return new URL(configured).origin
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin')
  return Boolean(origin) && origin === expectedOrigin(request)
}

export async function GET() {
  return NextResponse.json(
    { error: 'Logout requires POST' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Same-origin logout is required' }, { status: 403 })
  }

  const cookieStore = await cookies()
  const session = await getSessionFromCookies(cookieStore)
  if (!session?.sessionId) {
    return NextResponse.json({ error: 'Active session is required' }, { status: 401 })
  }

  const nonce = request.headers.get('x-csrf-token') || ''
  if (!isValidLogoutNonce(session.sessionId, nonce)) {
    return NextResponse.json({ error: 'Invalid logout token' }, { status: 403 })
  }

  await revokeFmuContexts(cookieStore)
  await revokeFmuContextsForSession(session.sessionId)
  if (session.samlNameId && session.samlSessionIndex) {
    await clearSamlSessionBinding(session.samlNameId, session.samlSessionIndex)
  }
  await clearSessionCookies(cookieStore)
  clearFmuContextCookie(cookieStore)

  return NextResponse.json({
    success: true,
    message: 'Session cleared successfully',
    timestamp: new Date().toISOString(),
  })
}
