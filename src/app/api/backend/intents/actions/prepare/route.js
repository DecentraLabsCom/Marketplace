import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { serializeIntent } from '@/utils/intents/serialize'
import {
  getIntentBackendAuthToken,
  requestIntentAuthorizationSession,
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
} from '@/utils/intents/backendClient'
import { extractOnchainErrorDetails, resolveChainNowSec } from '@/utils/intents/onchainHelpers'
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

function isCancellationAction(action) {
  return action === ACTION_CODES.CANCEL_BOOKING || action === ACTION_CODES.CANCEL_REQUEST_BOOKING
}

function isValidReservationKey(value) {
  return typeof value === 'string' && ethers.isHexString(value, 32)
}

function normalizeAddress(value) {
  if (typeof value !== 'string') return ''
  return value.toLowerCase()
}

async function resolveCancellationReservationSnapshot(reservationKey) {
  const contract = await getContractInstance()
  const reservation = await contract.getReservation(reservationKey)
  return {
    labId: reservation?.labId?.toString?.() ?? null,
    price: reservation?.price?.toString?.() ?? null,
    renter: reservation?.renter || ethers.ZeroAddress,
  }
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    const samlAssertion = session.samlAssertion
    const schacHomeOrganization = session.schacHomeOrganization || session.affiliation || session.organization || session.organizationName
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
    const backendUrl =
      body?.backendUrl ||
      payloadInput.backendUrl ||
      process.env.INSTITUTION_BACKEND_URL
    const returnUrl = body?.returnUrl || payloadInput.returnUrl || null

    if (action === null) {
      return NextResponse.json({ error: 'Invalid action code' }, { status: 400 })
    }

    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    let resolvedLabId = payloadInput.labId
    let resolvedPrice = payloadInput.price
    const reservationKey = payloadInput.reservationKey || ethers.ZeroHash

    if (isCancellationAction(action)) {
      if (!isValidReservationKey(reservationKey)) {
        return NextResponse.json({ error: 'Missing or invalid reservationKey for cancellation action' }, { status: 400 })
      }
      try {
        const snapshot = await resolveCancellationReservationSnapshot(reservationKey)
        if (normalizeAddress(snapshot.renter) === normalizeAddress(ethers.ZeroAddress)) {
          return NextResponse.json({ error: 'Reservation not found for cancellation action' }, { status: 404 })
        }
        resolvedLabId = snapshot.labId
        resolvedPrice = snapshot.price
      } catch (error) {
        devLog.error('[API] Failed to resolve reservation snapshot for cancellation intent', error)
        return NextResponse.json(
          { error: 'Failed to resolve reservation details for cancellation intent' },
          { status: 502 },
        )
      }
    }

    const executorAddress = await resolveIntentExecutorForInstitution(schacHomeOrganization)
    const adminAddress = await getAdminAddress()

    const chainNowSec = await resolveChainNowSec()
    const intentPackage = await buildActionIntent({
      action,
      executor: executorAddress,
      signer: adminAddress,
      schacHomeOrganization,
      assertionHash: computeAssertionHash(samlAssertion),
      puc: puc || '',
      labId: resolvedLabId ?? 0,
      reservationKey,
      uri: payloadInput.uri || '',
      price: resolvedPrice ?? 0,
      accessURI: payloadInput.accessURI || '',
      accessKey: payloadInput.accessKey || '',
      tokenURI: payloadInput.tokenURI || '',
      maxBatch: payloadInput.maxBatch ?? 0,
      nowSec: chainNowSec,
    })

    const adminSignature = await signIntentMeta(intentPackage.meta, intentPackage.typedData)

    let onChain = null
    try {
      onChain = await registerIntentOnChain('action', intentPackage.meta, intentPackage.payload, adminSignature)
    } catch (err) {
      devLog.error('[API] On-chain action intent registration failed', err)
      console.error('[API] On-chain action intent registration failed', err)
      const onchain = extractOnchainErrorDetails(err)
      return NextResponse.json(
        {
          error: 'Failed to register action intent on-chain',
          details: err?.message || String(err),
          onchain,
        },
        { status: 502 },
      )
    }

    let authorization = null
    let backendAuth = null
    try {
      backendAuth = await getIntentBackendAuthToken()

      const serializedMeta = serializeIntent(intentPackage.meta)
      const serializedPayload = serializeIntent(intentPackage.payload)

      const authResponse = await requestIntentAuthorizationSession({
        backendUrl,
        backendAuthToken: backendAuth.token,
        payloadKey: 'actionPayload',
        meta: serializedMeta,
        payload: serializedPayload,
        signature: adminSignature,
        samlAssertion,
        returnUrl,
      })

      authorization = authResponse.data
      if (!authResponse.ok) {
        const authError =
          authorization?.error ||
          authorization?.message ||
          'Failed to create authorization session'
        const code = mapAuthorizationErrorCode(authError)
        return NextResponse.json(
          code ? { error: authError, code } : { error: authError },
          { status: authResponse.status },
        )
      }

      const normalizedAuthorization = normalizeAuthorizationResponse(authorization)
      const hasUsableAuthorization = hasUsableAuthorizationSession(normalizedAuthorization)

      if (!hasUsableAuthorization) {
        devLog.error('[API] Authorization response missing session/url', { authorization })
        return NextResponse.json(
          {
            error: 'Invalid authorization response from institutional backend',
            code: 'INTENT_AUTHORIZATION_RESPONSE_INVALID',
          },
          { status: 502 },
        )
      }
      authorization = normalizedAuthorization
    } catch (err) {
      devLog.error('[API] Failed to request intent authorization', err)
      return NextResponse.json(
        { error: err?.message || 'Failed to request authorization session' },
        { status: 502 },
      )
    }

    const intentForTransport = serializeIntent(intentPackage)
    const authorizationUrl = resolveAuthorizationUrl(backendUrl, authorization)

    return NextResponse.json({
      kind: 'action',
      intent: intentForTransport,
      adminSignature,
      requestId: intentPackage.meta.requestId,
      requestedAt: intentPackage.meta.requestedAt.toString(),
      expiresAt: intentPackage.meta.expiresAt.toString(),
      executor: executorAddress,
      signer: adminAddress,
      backendUrl,
      onChain,
      authorizationUrl,
      authorizationSessionId: authorization?.sessionId || null,
      authorizationExpiresAt: authorization?.expiresAt || null,
      backendAuthToken: backendAuth?.token || null,
      backendAuthExpiresAt: backendAuth?.expiresAt || null,
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
