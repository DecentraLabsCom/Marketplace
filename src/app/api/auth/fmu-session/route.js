import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError, BadRequestError } from '@/utils/auth/guards'
import {
  GatewayValidationError,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import {
  FMU_CONTEXT_COOKIE,
  createFmuUserBinding,
  encodeFmuContexts,
  fmuContextCookieOptions,
  readFmuContexts,
} from '@/utils/auth/fmuSessionStore'

function parseGatewaySession(setCookie) {
  const jti = String(setCookie || '').match(/(?:^|,\s*)FMU_SESSION=([^;,\s]+)/)?.[1]
  const maxAge = Number(String(setCookie || '').match(/Max-Age=(\d+)/i)?.[1])
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(jti || '') || !Number.isFinite(maxAge) || maxAge < 1) return null
  return { jti, maxAge }
}

export async function POST(request) {
  try {
    const marketplaceSession = await requireAuth()
    const { accessCode, labURL, labId, reservationKey } = await request.json().catch(() => ({}))
    if (!accessCode || !labURL || !labId || !reservationKey) {
      throw new BadRequestError('accessCode, labURL, labId and reservationKey are required')
    }

    let gatewayBase
    try {
      gatewayBase = await resolveLabAccessGateway({
        labId,
        gatewayUrl: labURL,
        requireLabMatch: true,
      })
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        throw new BadRequestError(error.message)
      }
      throw error
    }
    if (new URL(gatewayBase).origin !== new URL(labURL).origin) {
      throw new BadRequestError('FMU destination does not match the canonical lab access gateway')
    }
    const gatewayResponse = await gatewayFetch(`${gatewayBase}/auth/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ access_code: String(accessCode) }),
      cache: 'no-store',
    })
    const session = parseGatewaySession(gatewayResponse.headers.get('set-cookie'))
    if (gatewayResponse.status !== 204) {
      return NextResponse.json({ error: 'FMU access-code exchange failed' }, { status: gatewayResponse.status || 502 })
    }
    if (!session) {
      return NextResponse.json({ error: 'FMU access-code exchange failed' }, { status: 502 })
    }

    const { encoded, contexts } = encodeFmuContexts(readFmuContexts(request), {
      labId,
      reservationKey,
      gatewayOrigin: gatewayBase,
      jti: session.jti,
      expiresAt: Math.floor(Date.now() / 1000) + session.maxAge,
      userBinding: createFmuUserBinding(marketplaceSession),
    })
    const response = NextResponse.json({ gatewayOrigin: new URL(gatewayBase).origin })
    response.cookies.set(FMU_CONTEXT_COOKIE, encoded, fmuContextCookieOptions(contexts))
    return response
  } catch (error) {
    return handleGuardError(error)
  }
}
