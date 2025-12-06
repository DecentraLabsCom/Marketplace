import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError, isValidAddress } from '@/utils/auth/guards'
import { buildReservationIntent, computeReservationAssertionHash } from '@/utils/intents/signInstitutionalReservationIntent'
import { resolveIntentExecutorAddress } from '@/utils/intents/resolveIntentExecutor'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getCredentialForUser, setAssertionChallenge } from '@/utils/webauthn/store'
import { buildIntentChallenge } from '@/utils/webauthn/challenge'
import { serializeIntent } from '@/utils/intents/serialize'
import { signIntentMeta, getAdminAddress } from '@/utils/intents/adminIntentSigner'
import devLog from '@/utils/dev/logger'

export async function POST(request) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const { labId, start, timeslot, gatewayUrl: gatewayUrlOverride } = body || {}

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

    const credential = getCredentialForUser(puc)
    if (!credential) {
      return NextResponse.json(
        { error: 'WebAuthn credential not registered for this SSO user', code: 'WEBAUTHN_REQUIRED' },
        { status: 428 },
      )
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
      kind: 'reservation',
      meta: intentPackage.meta,
      payload: intentPackage.payload,
      payloadHash: intentPackage.payloadHash,
      adminSignature,
      gatewayUrl: gatewayUrlOverride || process.env.INSTITUTION_GATEWAY_URL,
      createdAt: Date.now(),
    })

    const intentForTransport = serializeIntent(intentPackage)

    return NextResponse.json({
      kind: 'reservation',
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
      gatewayUrl: gatewayUrlOverride || process.env.INSTITUTION_GATEWAY_URL || null,
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
