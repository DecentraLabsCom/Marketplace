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
import { publicErrorResponse } from '@/utils/security/publicError'

function parseGatewaySession(setCookie) {
  const jti = String(setCookie || '').match(/(?:^|,\s*)FMU_SESSION=([^;,\s]+)/)?.[1]
  const maxAge = Number(String(setCookie || '').match(/Max-Age=(\d+)/i)?.[1])
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(jti || '') || !Number.isFinite(maxAge) || maxAge < 1) return null
  return { jti, maxAge }
}

export async function POST(request) {
  try {
    const marketplaceSession = await requireAuth()
    const { accessCode, labId, reservationKey } = await request.json().catch(() => ({}))
    if (!accessCode || !labId || !reservationKey) {
      throw new BadRequestError('accessCode, labId and reservationKey are required')
    }

    let gatewayBase
    try {
      gatewayBase = await resolveLabAccessGateway({ labId })
    } catch (error) {
      if (error instanceof GatewayValidationError) {
        throw new BadRequestError('The FMU gateway endpoint is invalid.')
      }
      throw error
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
      return publicErrorResponse({
        status: gatewayResponse.status || 502,
        code: 'FMU_ACCESS_FAILED',
        message: 'The FMU access-code exchange could not be completed.',
        error: new Error(`FMU access gateway returned ${gatewayResponse.status}`),
        context: 'fmu-session-upstream',
      })
    }
    if (!session) {
      return publicErrorResponse({
        status: 502,
        code: 'FMU_ACCESS_FAILED',
        message: 'The FMU access-code exchange could not be completed.',
        error: new Error('FMU access gateway returned an invalid session cookie'),
        context: 'fmu-session-cookie',
      })
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
    return handleGuardError(error, request)
  }
}
