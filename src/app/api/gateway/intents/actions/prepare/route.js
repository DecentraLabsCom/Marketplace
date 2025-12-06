import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { resolveIntentExecutorAddress } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getCredentialForUser, setAssertionChallenge } from '@/utils/webauthn/store'
import { buildIntentChallenge } from '@/utils/webauthn/challenge'
import { signIntentMeta, getAdminAddress } from '@/utils/intents/adminIntentSigner'
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

    if (action === null) {
      return NextResponse.json({ error: 'Invalid action code' }, { status: 400 })
    }

    const credential = getCredentialForUser(puc)
    if (!credential) {
      return NextResponse.json(
        { error: 'WebAuthn credential not registered for this SSO user', code: 'WEBAUTHN_REQUIRED' },
        { status: 428 },
      )
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
      auth: payloadInput.auth || '',
      accessURI: payloadInput.accessURI || '',
      accessKey: payloadInput.accessKey || '',
      tokenURI: payloadInput.tokenURI || '',
      maxBatch: payloadInput.maxBatch ?? 0,
    })

    const adminSignature = await signIntentMeta(intentPackage.meta, intentPackage.typedData)

    const { challenge, challengeString } = buildIntentChallenge({
      puc,
      credentialId: credential.credentialId,
      meta: intentPackage.meta,
      payloadHash: intentPackage.payloadHash,
    })

    setAssertionChallenge(intentPackage.meta.requestId, {
      expectedChallenge: challenge,
      credentialId: credential.credentialId,
      puc,
      kind: 'action',
      meta: intentPackage.meta,
      payload: intentPackage.payload,
      payloadHash: intentPackage.payloadHash,
      adminSignature,
      gatewayUrl,
      createdAt: Date.now(),
    })

    const intentForTransport = serializeIntent(intentPackage)

    return NextResponse.json({
      kind: 'action',
      intent: intentForTransport,
      adminSignature,
      webauthnChallenge: challenge,
      webauthnChallengeString: challengeString,
      webauthnCredentialId: credential.credentialId,
      allowCredentials: [{ id: credential.credentialId, type: 'public-key' }],
      requestId: intentPackage.meta.requestId,
      requestedAt: intentPackage.meta.requestedAt.toString(),
      expiresAt: intentPackage.meta.expiresAt.toString(),
      executor: executorAddress,
      signer: adminAddress,
      gatewayUrl,
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
