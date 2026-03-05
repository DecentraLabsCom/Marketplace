import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { registerCredentialInBackend, verifyRegistration, getPucFromSession } from '@/utils/webauthn/service'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import devLog from '@/utils/dev/logger'

export async function POST(request) {
  try {
    const session = await requireAuth()
    const puc = getPucFromSession(session)

    if (!puc) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Missing attestation response' }, { status: 400 })
    }

    const attestationResponse = body.attestation || body.response || body
    const record = await verifyRegistration(session, attestationResponse, request)

    let backendRegistered = false
    const backendUrl = process.env.INSTITUTION_BACKEND_URL
    if (backendUrl) {
      let backendAuthToken = null
      try {
        const backendAuth = await marketplaceJwtService.generateIntentBackendToken({
          scope: 'webauthn:manage',
          expiresInSeconds: 2 * 60,
          subject: record.userId || puc,
          claims: {
            userid: record.userId || puc,
          },
        })
        backendAuthToken = backendAuth.token
      } catch (tokenError) {
        devLog.warn('[API] Failed to generate backend auth token for WebAuthn register:', tokenError?.message || tokenError)
      }

      backendRegistered = await registerCredentialInBackend(record, backendUrl, { backendAuthToken })
    }

    return NextResponse.json({
      registered: true,
      credentialId: record.credentialId,
      publicKeySpki: record.publicKeySpki,
      signCount: record.signCount,
      aaguid: record.aaguid,
      backendRegistered,
      status: record.status,
    })
  } catch (error) {
    devLog.error('[API] WebAuthn registration error', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }

    return NextResponse.json(
      { registered: false, error: error.message || 'Failed to register WebAuthn credential' },
      { status: 500 },
    )
  }
}
