import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getStableUserIdModeFromSession, normalizePuc } from '@/utils/auth/puc'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  IntentSignerBusyError,
  IntentSignerUnavailableError,
  withIntentSignerLock,
} from '@/utils/intents/intentNonceStore'
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
import { resolveChainNowSec } from '@/utils/intents/onchainHelpers'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import devLog from '@/utils/dev/logger'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'intent-action-prepare', windowMs: 60_000, maxRequests: 10 })

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

function normalizeNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
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
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, session))
    if (rateLimitResponse) return rateLimitResponse
    const samlAssertion = session.samlAssertion
    const schacHomeOrganization = resolveInstitutionDomainFromSession(session)
    const puc = getPucFromSession(session)
    const normalizedPuc = normalizePuc(puc) || ''
    const pucHash = normalizedPuc
      ? ethers.keccak256(ethers.toUtf8Bytes(normalizedPuc))
      : ethers.ZeroHash

    if (!samlAssertion) {
      return NextResponse.json({ error: 'Missing SAML assertion in session' }, { status: 400 })
    }
    const body = await request.json().catch(() => ({}))
    const action = normalizeAction(body?.action)
    const payloadInput = body?.payload || {}
    const backendUrl = await resolveInstitutionalBackendUrl(schacHomeOrganization)
    const returnUrl = body?.returnUrl || payloadInput.returnUrl || null

    if (action === null) {
      return NextResponse.json({ error: 'Invalid action code' }, { status: 400 })
    }

    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    let resolvedLabId = payloadInput.labId
    let resolvedPrice = payloadInput.price
    const resolvedMaxBatch = payloadInput.maxBatch
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
    let intentPackage
    let adminSignature
    let onChain = null
    try {
      const coordinated = await withIntentSignerLock(adminAddress, async () => {
        const packageValue = await buildActionIntent({
          action,
          executor: executorAddress,
          signer: adminAddress,
          schacHomeOrganization,
          assertionHash: computeAssertionHash(samlAssertion),
          pucHash,
          labId: resolvedLabId ?? 0,
          reservationKey,
          uri: payloadInput.uri || '',
          price: resolvedPrice ?? 0,
          accessURI: payloadInput.accessURI || '',
          accessKey: payloadInput.accessKey || '',
          tokenURI: payloadInput.tokenURI || '',
          resourceType: payloadInput.resourceType ?? 0,
          maxBatch: resolvedMaxBatch ?? 0,
          nowSec: chainNowSec,
          requestId: body?.requestId || payloadInput.requestId,
        })
        const signature = await signIntentMeta(packageValue.meta, packageValue.typedData)
        const registration = await registerIntentOnChain(
          'action',
          packageValue.meta,
          packageValue.payload,
          signature,
        )
        return { packageValue, signature, registration }
      })
      intentPackage = coordinated.packageValue
      adminSignature = coordinated.signature
      onChain = coordinated.registration
    } catch (err) {
      if (err instanceof IntentSignerBusyError) {
        return publicErrorResponse({
          status: 409,
          code: 'INTENT_SIGNER_BUSY',
          message: 'Another intent is being processed. Please retry shortly.',
          error: err,
          context: 'action-intent-signer-busy',
        })
      }
      if (err instanceof IntentSignerUnavailableError) {
        return publicErrorResponse({
          status: 503,
          code: 'INTENT_SIGNER_COORDINATOR_UNAVAILABLE',
          message: 'The intent request could not be coordinated. Please retry shortly.',
          error: err,
          context: 'action-intent-signer-coordinator',
        })
      }
      devLog.error('[API] On-chain action intent registration failed', err)
      return publicErrorResponse({
        status: 502,
        code: 'ACTION_INTENT_ONCHAIN_FAILED',
        message: 'The action request could not be registered.',
        error: err,
        context: 'action-intent-onchain',
      })
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
        stableUserIdMode: getStableUserIdModeFromSession(session),
        returnUrl,
      })

      authorization = authResponse.data
      if (!authResponse.ok) {
        const authError =
          authorization?.error ||
          authorization?.message ||
          'Failed to create authorization session'
        const code = mapAuthorizationErrorCode(authError)
        const message = code === 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED'
          ? 'No registered passkey was found for this account.'
          : code === 'MISSING_PUC_FOR_WEBAUTHN'
            ? 'The institutional identity could not be verified.'
            : 'The institutional authorization request could not be created.'
        return publicErrorResponse({
          status: authResponse.status || 502,
          code: code || 'INTENT_AUTHORIZATION_FAILED',
          message,
          error: new Error(String(authError)),
          context: 'action-intent-authorization',
        })
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
      return publicErrorResponse({
        status: 502,
        code: 'INTENT_AUTHORIZATION_FAILED',
        message: 'The institutional authorization request could not be created.',
        error: err,
        context: 'action-intent-authorization',
      })
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
      return handleGuardError(error, request)
    }

    return publicErrorResponse({
      status: 500,
      code: 'INTENT_PREPARE_FAILED',
      message: 'The action request could not be prepared.',
      error,
      context: 'action-intent-prepare',
    })
  }
}
