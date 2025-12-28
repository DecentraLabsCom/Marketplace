import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { resolveIntentExecutorAddress } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { serializeIntent } from '@/utils/intents/serialize'
import devLog from '@/utils/dev/logger'

function normalizeAction(action) {
  if (typeof action === 'number') return action
  if (typeof action === 'string') {
    const key = action.toUpperCase()
    if (ACTION_CODES[key] !== undefined) return ACTION_CODES[key]
    const asNumber = Number(action)
    if (!Number.isNaN(asNumber)) return asNumber
  }
  return null
}

function getGatewayApiKey() {
  return (
    process.env.INSTITUTIONAL_SP_API_KEY ||
    process.env.INSTITUTION_GATEWAY_SP_API_KEY ||
    process.env.SP_API_KEY ||
    null
  )
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    const samlAssertion = session.samlAssertion
    const schacHomeOrganization = session.schacHomeOrganization || session.organization || session.organizationName
    const puc = getPucFromSession(session)

    if (!samlAssertion) {
      return NextResponse.json({ error: 'Missing SAML assertion in session' }, { status: 400 })
    }
    if (!schacHomeOrganization) {
      return NextResponse.json({ error: 'Missing schacHomeOrganization in session' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const action = normalizeAction(body?.action)
    const payloadInput = body?.payload || {}
    const gatewayUrl = body?.gatewayUrl || payloadInput.gatewayUrl || process.env.INSTITUTION_GATEWAY_URL
    const returnUrl = body?.returnUrl || payloadInput.returnUrl || null

    if (action === null) {
      return NextResponse.json({ error: 'Invalid action code' }, { status: 400 })
    }

    if (!gatewayUrl) {
      return NextResponse.json({ error: 'Missing institutional gateway URL' }, { status: 400 })
    }

    const executorAddress = resolveIntentExecutorAddress()
    const adminAddress = await getAdminAddress()

    const intentPackage = await buildActionIntent({
      action,
      executor: executorAddress,
      signer: adminAddress,
      schacHomeOrganization,
      assertionHash: computeAssertionHash(samlAssertion),
      puc: puc || '',
      labId: payloadInput.labId || 0,
      reservationKey: payloadInput.reservationKey || ethers.ZeroHash,
      uri: payloadInput.uri || '',
      price: payloadInput.price ?? 0,
      accessURI: payloadInput.accessURI || '',
      accessKey: payloadInput.accessKey || '',
      tokenURI: payloadInput.tokenURI || '',
      maxBatch: payloadInput.maxBatch ?? 0,
    })

    const adminSignature = await signIntentMeta(intentPackage.meta, intentPackage.typedData)

    let onChain = null
    try {
      onChain = await registerIntentOnChain('action', intentPackage.meta, intentPackage.payload, adminSignature)
    } catch (err) {
      devLog.error('[API] On-chain action intent registration failed', err)
      return NextResponse.json(
        { error: 'Failed to register action intent on-chain', details: err?.message || String(err) },
        { status: 502 },
      )
    }

    let authorization = null
    try {
      const apiKey = getGatewayApiKey()
      const headers = { 'Content-Type': 'application/json' }
      if (apiKey) {
        headers['x-api-key'] = apiKey
      }

      const serializedMeta = serializeIntent(intentPackage.meta)
      const serializedPayload = serializeIntent(intentPackage.payload)

      const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/intents/authorize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meta: serializedMeta,
          actionPayload: serializedPayload,
          signature: adminSignature,
          samlAssertion,
          returnUrl,
        }),
      })

      authorization = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json(
          { error: authorization?.error || authorization?.message || 'Failed to create authorization session' },
          { status: res.status },
        )
      }
    } catch (err) {
      devLog.error('[API] Failed to request intent authorization', err)
      return NextResponse.json(
        { error: err?.message || 'Failed to request authorization session' },
        { status: 502 },
      )
    }

    const intentForTransport = serializeIntent(intentPackage)
    const fallbackUrl = authorization?.sessionId
      ? `${gatewayUrl.replace(/\/$/, '')}/intents/authorize/ceremony/${authorization.sessionId}`
      : null
    const authorizationUrl = authorization?.ceremonyUrl || authorization?.authorizationUrl || fallbackUrl

    return NextResponse.json({
      kind: 'action',
      intent: intentForTransport,
      adminSignature,
      requestId: intentPackage.meta.requestId,
      requestedAt: intentPackage.meta.requestedAt.toString(),
      expiresAt: intentPackage.meta.expiresAt.toString(),
      executor: executorAddress,
      signer: adminAddress,
      gatewayUrl,
      onChain,
      authorizationUrl,
      authorizationSessionId: authorization?.sessionId || null,
      authorizationExpiresAt: authorization?.expiresAt || null,
    })
  } catch (error) {
    devLog.error('[API] Prepare action intent failed', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to prepare action intent', code: 'INTENT_PREPARE_FAILED' },
      { status: 500 },
    )
  }
}
