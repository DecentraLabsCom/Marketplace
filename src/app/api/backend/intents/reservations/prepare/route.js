import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { buildReservationIntent, computeReservationAssertionHash, ACTION_CODES } from '@/utils/intents/signInstitutionalReservationIntent'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getStableUserIdModeFromSession, normalizePuc } from '@/utils/auth/puc'
import { serializeIntent } from '@/utils/intents/serialize'
import { signIntentMeta, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  IntentSignerBusyError,
  IntentSignerUnavailableError,
  withIntentSignerLock,
} from '@/utils/intents/intentNonceStore'
import {
  getIntentBackendAuthToken,
  requestIntentAuthorizationSession,
  notifyIntentRegistrationMined,
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
} from '@/utils/intents/backendClient'
import { resolveChainNowSec } from '@/utils/intents/onchainHelpers'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'
import { calculateReservationTotal } from '@/utils/pricing/pricingUnits'
import devLog from '@/utils/dev/logger'
import { getCachedAdminAddress, getCachedIntentExecutorForInstitution } from './cache'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'intent-reservation-prepare', windowMs: 60_000, maxRequests: 10 })

function parsePositiveBigInt(value, fieldName) {
  try {
    const parsed = BigInt(value)
    if (parsed <= 0n) {
      return { error: `Invalid ${fieldName}` }
    }
    return { value: parsed }
  } catch {
    return { error: `Invalid ${fieldName}` }
  }
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, session))
    if (rateLimitResponse) return rateLimitResponse
    const body = await request.json()
    const { labId, start, end, timeslot, returnUrl } = body || {}

    if (labId === undefined || labId === null) {
      return NextResponse.json({ error: 'Missing labId' }, { status: 400 })
    }
    if (start === undefined || start === null) {
      return NextResponse.json({ error: 'Missing start' }, { status: 400 })
    }
    const parsedStart = parsePositiveBigInt(start, 'start')
    if (parsedStart.error) {
      return NextResponse.json({ error: parsedStart.error }, { status: 400 })
    }

    let parsedEnd
    let durationSeconds
    if (end !== undefined && end !== null) {
      parsedEnd = parsePositiveBigInt(end, 'end')
      if (parsedEnd.error) {
        return NextResponse.json({ error: parsedEnd.error }, { status: 400 })
      }
      durationSeconds = parsedEnd.value - parsedStart.value
    } else {
      const parsedTimeslot = parsePositiveBigInt(timeslot, 'timeslot')
      if (parsedTimeslot.error) {
        return NextResponse.json({ error: parsedTimeslot.error }, { status: 400 })
      }
      durationSeconds = parsedTimeslot.value
      parsedEnd = { value: parsedStart.value + parsedTimeslot.value }
    }

    if (durationSeconds <= 0n) {
      return NextResponse.json({ error: 'Reservation end must be after start' }, { status: 400 })
    }

    const now = Math.floor(Date.now() / 1000)
    if (Number(parsedStart.value) < now) {
      return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 })
    }

    const samlAssertion = session.samlAssertion
    if (!samlAssertion) {
      return NextResponse.json({ error: 'Missing SAML assertion in session' }, { status: 400 })
    }

    const schacHomeOrganization = resolveInstitutionDomainFromSession(session)

    const puc = getPucFromSession(session)
    if (!puc) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }
    const normalizedPuc = normalizePuc(puc)
    const pucHash = normalizedPuc
      ? ethers.keccak256(ethers.toUtf8Bytes(normalizedPuc))
      : ethers.ZeroHash
    if (pucHash === ethers.ZeroHash) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }

    const backendUrl = await resolveInstitutionalBackendUrl(schacHomeOrganization)
    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    const executorAddressPromise = getCachedIntentExecutorForInstitution(schacHomeOrganization)
    const adminAddressPromise = getCachedAdminAddress()
    const priceProviderPromise = getContractInstance()
    const chainNowSecPromise = resolveChainNowSec()

    const priceProvider = await priceProviderPromise
    const [labData, labOwner, institution, executorAddress, adminAddress, chainNowSec] = await Promise.all([
      priceProvider.getLab(labId),
      priceProvider.ownerOf(BigInt(labId)),
      resolveInstitutionAddressFromSession(session, priceProvider),
      executorAddressPromise,
      adminAddressPromise,
      chainNowSecPromise,
    ])

    const rawPrice = labData?.base?.price ?? labData?.price ?? 0n
    const pricePerSecond = BigInt(rawPrice)

    const { institutionAddress } = institution
    const bookingAction = labOwner.toLowerCase() === institutionAddress.toLowerCase()
      ? ACTION_CODES.DIRECT_BOOKING
      : ACTION_CODES.REQUEST_BOOKING

    const price = calculateReservationTotal(pricePerSecond, parsedStart.value, parsedEnd.value)
    const reservationKey = ethers.solidityPackedKeccak256(['uint256', 'uint32'], [BigInt(labId), parsedStart.value])
    const assertionHash = computeReservationAssertionHash(samlAssertion)

    let intentPackage
    let adminSignature
    let authorization = null
    let backendAuth = null
    let onChain = null
    let authPromise
    try {
      const coordinated = await withIntentSignerLock(adminAddress, async () => {
        const packageValue = await buildReservationIntent({
          executor: executorAddress,
          signer: adminAddress,
          schacHomeOrganization,
          pucHash,
          assertionHash,
          labId,
          start: parsedStart.value,
          end: parsedEnd.value,
          price,
          reservationKey,
          nowSec: chainNowSec,
          action: bookingAction,
          requestId: body?.requestId,
        })
        const signature = await signIntentMeta(packageValue.meta, packageValue.typedData)
        const authToken = await getIntentBackendAuthToken()
        const serializedMeta = serializeIntent(packageValue.meta)
        const serializedPayload = serializeIntent(packageValue.payload)
        const authorizationPromise = requestIntentAuthorizationSession({
          backendUrl,
          backendAuthToken: authToken.token,
          payloadKey: 'reservationPayload',
          meta: serializedMeta,
          payload: serializedPayload,
          signature,
          samlAssertion,
          stableUserIdMode: getStableUserIdModeFromSession(session),
          returnUrl: returnUrl || null,
        })
        const registrationSubmission = await registerIntentOnChain(
          'reservation',
          packageValue.meta,
          packageValue.payload,
          signature,
          { waitForReceipt: false },
        )
        const receipt = typeof registrationSubmission?.wait === 'function'
          ? await registrationSubmission.wait()
          : null
        return {
          packageValue,
          signature,
          authToken,
          authorizationPromise,
          registrationSubmission,
          receipt,
        }
      })

      intentPackage = coordinated.packageValue
      adminSignature = coordinated.signature
      backendAuth = coordinated.authToken
      authPromise = coordinated.authorizationPromise
      const registrationSubmission = coordinated.registrationSubmission || {}
      onChain = {
        txHash: registrationSubmission.txHash || null,
        blockNumber: coordinated.receipt?.blockNumber || registrationSubmission.blockNumber || null,
        status: coordinated.receipt ? 'confirmed' : 'submitted',
      }
      if (coordinated.receipt) {
        try {
          const signalResult = await notifyIntentRegistrationMined({
            backendUrl,
            backendAuthToken: backendAuth.token,
            requestId: intentPackage.meta.requestId,
            txHash: registrationSubmission.txHash || null,
            blockNumber: coordinated.receipt.blockNumber || null,
          })
          if (signalResult && !signalResult.ok) {
            devLog.warn('[API] Reservation registration mined signal was not accepted', signalResult)
          }
        } catch (error) {
          devLog.warn('[API] Reservation registration mined signal skipped', error)
        }
      }

    } catch (err) {
      if (err instanceof IntentSignerBusyError) {
        return publicErrorResponse({
          status: 409,
          code: 'INTENT_SIGNER_BUSY',
          message: 'Another intent is being processed. Please retry shortly.',
          error: err,
          context: 'reservation-intent-signer-busy',
        })
      }
      if (err instanceof IntentSignerUnavailableError) {
        return publicErrorResponse({
          status: 503,
          code: 'INTENT_SIGNER_COORDINATOR_UNAVAILABLE',
          message: 'The reservation request could not be coordinated. Please retry shortly.',
          error: err,
          context: 'reservation-intent-signer-coordinator',
        })
      }
      devLog.error('[API] On-chain reservation intent registration failed', err)
      return publicErrorResponse({
        status: 502,
        code: 'RESERVATION_INTENT_ONCHAIN_FAILED',
        message: 'The reservation request could not be registered.',
        error: err,
        context: 'reservation-intent-onchain',
      })
    }

    try {
      const authResponse = await authPromise
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
          context: 'reservation-intent-authorization',
        })
      }

      const normalizedAuthorization = normalizeAuthorizationResponse(authorization)
      const hasUsableAuthorization = hasUsableAuthorizationSession(normalizedAuthorization)

      if (!hasUsableAuthorization) {
        devLog.error('[API] Reservation authorization response missing session/url', { authorization })
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
        context: 'reservation-intent-authorization',
      })
    }

    const intentForTransport = serializeIntent(intentPackage)
    const authorizationUrl = resolveAuthorizationUrl(backendUrl, authorization)

    return NextResponse.json({
      kind: 'reservation',
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
    devLog.error('[API] Prepare reservation intent failed', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error, request)
    }

    return publicErrorResponse({
      status: 500,
      code: 'INTENT_PREPARE_FAILED',
      message: 'The reservation request could not be prepared.',
      error,
      context: 'reservation-intent-prepare',
    })
  }
}
