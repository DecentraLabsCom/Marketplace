import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { registerCredentialInGateway, verifyRegistration, getPucFromSession } from '@/utils/webauthn/service'
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

    let gatewayRegistered = false
    const gatewayUrl = process.env.INSTITUTION_GATEWAY_URL
    if (gatewayUrl) {
      gatewayRegistered = await registerCredentialInGateway(record, gatewayUrl)
    }

    return NextResponse.json({
      registered: true,
      credentialId: record.credentialId,
      publicKeySpki: record.publicKeySpki,
      signCount: record.signCount,
      aaguid: record.aaguid,
      gatewayRegistered,
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
