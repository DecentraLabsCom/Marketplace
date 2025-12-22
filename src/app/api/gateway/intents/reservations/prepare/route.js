import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { buildReservationIntent, computeReservationAssertionHash } from '@/utils/intents/signInstitutionalReservationIntent'
import { resolveIntentExecutorAddress } from '@/utils/intents/resolveIntentExecutor'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { serializeIntent } from '@/utils/intents/serialize'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import devLog from '@/utils/dev/logger'

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
    const body = await request.json()
    const { labId, start, timeslot, gatewayUrl: gatewayUrlOverride, returnUrl } = body || {}

    if (labId === undefined || labId === null) {
      return NextResponse.json({ error: 'Missing labId' }, { status: 400 })
    }
    if (start === undefined || start === null) {
      return NextResponse.json({ error: 'Missing start' }, { status: 400 })
    }
    if (!timeslot || Number(timeslot) <= 0) {
      return NextResponse.json({ error: 'Invalid timeslot' }, { status: 400 })
    }

    const now = Math.floor(Date.now() / 1000)
    if (Number(start) < now) {
      return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 })
    }

    const samlAssertion = session.samlAssertion
    if (!samlAssertion) {
      return NextResponse.json({ error: 'Missing SAML assertion in session' }, { status: 400 })
    }

    const schacHomeOrganization = session.schacHomeOrganization || session.organization || session.organizationName
    if (!schacHomeOrganization) {
      return NextResponse.json({ error: 'Missing schacHomeOrganization in session' }, { status: 400 })
    }

    const puc = getPucFromSession(session)
    if (!puc) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }

    const gatewayUrl = gatewayUrlOverride || process.env.INSTITUTION_GATEWAY_URL
    if (!gatewayUrl) {
      return NextResponse.json({ error: 'Missing institutional gateway URL' }, { status: 400 })
    }

    const executorAddress = resolveIntentExecutorAddress()
    const adminAddress = await getAdminAddress()
    const priceProvider = await getContractInstance()
    const labData = await priceProvider.getLab(labId)
    const price = labData?.base?.price ?? labData?.price ?? 0n

    const end = BigInt(start) + BigInt(timeslot)
    const reservationKey = ethers.solidityPackedKeccak256(['uint256', 'uint32'], [BigInt(labId), BigInt(start)])
    const assertionHash = computeReservationAssertionHash(samlAssertion)

    const intentPackage = await buildReservationIntent({
      executor: executorAddress,
      signer: adminAddress,
      schacHomeOrganization,
      puc,
      assertionHash,
      labId,
      start,
      end,
      price,
      reservationKey,
    })

    const adminSignature = await signIntentMeta(intentPackage.meta, intentPackage.typedData)

    let onChain = null
    try {
      onChain = await registerIntentOnChain('reservation', intentPackage.meta, intentPackage.payload, adminSignature)
    } catch (err) {
      devLog.error('[API] On-chain reservation intent registration failed', err)
      return NextResponse.json(
        { error: 'Failed to register reservation intent on-chain', details: err?.message || String(err) },
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
          reservationPayload: serializedPayload,
          signature: adminSignature,
          samlAssertion,
          returnUrl: returnUrl || null,
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
      devLog.error('[API] Failed to request reservation authorization', err)
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
      kind: 'reservation',
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
    devLog.error('[API] Prepare reservation intent failed', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to prepare reservation intent', code: 'INTENT_PREPARE_FAILED' },
      { status: 500 },
    )
  }
}
