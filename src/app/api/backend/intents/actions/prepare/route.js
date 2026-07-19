import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { buildReservationIntent, computeReservationAssertionHash } from '@/utils/intents/signInstitutionalReservationIntent'
import {
  DIRECT_BOOKING_ACTION,
  IntentPrepareValidationError,
  isReservationIntentAction,
  normalizeIntentAction,
  normalizeResourceType,
  parseUint,
  validateActionPayload,
  validateCancellationReservationKey,
  validateReservationPayload,
  validateReservationWindow,
  validateReturnUrl,
  INTENT_UINT_LIMITS,
} from '@/utils/intents/prepareValidation'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getStableUserIdModeFromSession, normalizePuc } from '@/utils/auth/puc'
import { signIntentMeta, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  IntentSignerBusyError,
  IntentSignerUnavailableError,
  getServerSignerAddress,
  withIntentSignerLock,
} from '@/utils/intents/intentNonceStore'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { serializeIntent } from '@/utils/intents/serialize'
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
import { getCachedAdminAddress, getCachedIntentExecutorForInstitution } from '@/utils/intents/prepareCache'
import devLog from '@/utils/dev/logger'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'

const checkRate = createRateLimiter({ operation: 'intent-prepare', windowMs: 60_000, maxRequests: 10 })

const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase()

function isZeroAddress(value) {
  return typeof value !== 'string' || value.toLowerCase() === ZERO_ADDRESS
}

async function resolveCancellationReservationSnapshot(reservationKey) {
  const contract = await getContractInstance()
  const reservation = await contract.getReservation(reservationKey)
  const labId = reservation?.labId?.toString?.() ?? null
  const renter = reservation?.renter || ethers.ZeroAddress
  if (!labId || labId === '0' || isZeroAddress(renter)) return null

  return {
    labId,
    price: reservation?.price?.toString?.() ?? null,
    start: reservation?.start?.toString?.() ?? null,
    end: reservation?.end?.toString?.() ?? null,
    renter,
  }
}

function resolveAuthorizationMessage(error) {
  const code = mapAuthorizationErrorCode(error)
  const message = code === 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED'
    ? 'No registered passkey was found for this account.'
    : code === 'MISSING_PUC_FOR_WEBAUTHN'
      ? 'The institutional identity could not be verified.'
      : 'The institutional authorization request could not be created.'
  return { code: code || 'INTENT_AUTHORIZATION_FAILED', message }
}

function resolveActionPayloadInput(payloadInput, action, cancellationSnapshot) {
  if (action === ACTION_CODES.CANCEL_BOOKING) {
    return {
      labId: parseUint(cancellationSnapshot.labId, 'labId', { min: 1n }),
      price: parseUint(cancellationSnapshot.price, 'price', { max: INTENT_UINT_LIMITS.UINT96_MAX }),
      reservationKey: payloadInput.reservationKey,
    }
  }

  return {
    labId: parseUint(payloadInput.labId ?? 0, 'labId'),
    reservationKey: ethers.ZeroHash,
    uri: payloadInput.uri || '',
    price: parseUint(payloadInput.price ?? 0, 'price', { max: INTENT_UINT_LIMITS.UINT96_MAX }),
    accessURI: payloadInput.accessURI || '',
    accessKey: payloadInput.accessKey || '',
    tokenURI: payloadInput.tokenURI || '',
    resourceType: normalizeResourceType(payloadInput.resourceType),
    maxBatch: parseUint(payloadInput.maxBatch ?? 0, 'maxBatch', { max: INTENT_UINT_LIMITS.UINT96_MAX }),
  }
}

async function prepareReservationData({ action, payloadInput, session, contract, cancellationSnapshot: existingSnapshot }) {
  if (action === ACTION_CODES.CANCEL_REQUEST_BOOKING) {
    validateCancellationReservationKey(payloadInput.reservationKey)
    const snapshot = existingSnapshot || await resolveCancellationReservationSnapshot(payloadInput.reservationKey)
    if (!snapshot) {
      return { error: NextResponse.json({ error: 'Reservation not found for cancellation action' }, { status: 404 }) }
    }

    const start = parseUint(snapshot.start, 'start', { min: 1n, max: INTENT_UINT_LIMITS.UINT32_MAX })
    const end = parseUint(snapshot.end, 'end', { min: 1n, max: INTENT_UINT_LIMITS.UINT32_MAX })
    if (end <= start) {
      return { error: NextResponse.json({ error: 'Invalid reservation window' }, { status: 400 }) }
    }

    return {
      kind: 'reservation',
      action,
      labId: parseUint(snapshot.labId, 'labId', { min: 1n }),
      start,
      end,
      price: parseUint(snapshot.price, 'price', { max: INTENT_UINT_LIMITS.UINT96_MAX }),
      reservationKey: payloadInput.reservationKey,
      assertionHash: computeReservationAssertionHash(session.samlAssertion),
    }
  }

  const window = validateReservationWindow(payloadInput)
  const [labData, labOwner, institution] = await Promise.all([
    contract.getLab(window.labId),
    contract.ownerOf(window.labId),
    resolveInstitutionAddressFromSession(session, contract),
  ])
  const institutionAddress = institution?.institutionAddress
  const ownsLab = typeof labOwner === 'string'
    && typeof institutionAddress === 'string'
    && labOwner.toLowerCase() === institutionAddress.toLowerCase()

  if (action === DIRECT_BOOKING_ACTION && !ownsLab) {
    return {
      error: NextResponse.json(
        { error: 'DIRECT_BOOKING requires the institution to own the lab' },
        { status: 400 },
      ),
    }
  }

  const bookingAction = ownsLab ? DIRECT_BOOKING_ACTION : ACTION_CODES.REQUEST_BOOKING
  const rawPrice = labData?.base?.price ?? labData?.price ?? 0n
  const pricePerSecond = parseUint(rawPrice, 'lab price', { max: INTENT_UINT_LIMITS.UINT96_MAX })
  const price = calculateReservationTotal(pricePerSecond, window.start, window.end)
  if (price > INTENT_UINT_LIMITS.UINT96_MAX) {
    return { error: NextResponse.json({ error: 'Reservation price exceeds contract limits' }, { status: 400 }) }
  }

  return {
    kind: 'reservation',
    action: bookingAction,
    labId: window.labId,
    start: window.start,
    end: window.end,
    price,
    reservationKey: ethers.solidityPackedKeccak256(['uint256', 'uint32'], [window.labId, window.start]),
    assertionHash: computeReservationAssertionHash(session.samlAssertion),
  }
}

function authorizationErrorResponse(authResponse, authorization, context) {
  const authError = authorization?.error || authorization?.message || 'Failed to create authorization session'
  const { code, message } = resolveAuthorizationMessage(authError)
  return publicErrorResponse({
    status: authResponse.status || 502,
    code,
    message,
    error: new Error(String(authError)),
    context,
  })
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, session))
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json().catch(() => ({}))
    const payloadInput = body?.payload || {}
    const action = normalizeIntentAction(body?.action)
    if (action === null) return NextResponse.json({ error: 'Invalid action code' }, { status: 400 })

    const schacHomeOrganization = resolveInstitutionDomainFromSession(session)
    const samlAssertion = session.samlAssertion
    if (!samlAssertion) return NextResponse.json({ error: 'Missing SAML assertion in session' }, { status: 400 })

    const puc = normalizePuc(getPucFromSession(session))
    if (!puc) return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    const pucHash = ethers.keccak256(ethers.toUtf8Bytes(puc))
    const backendUrl = await resolveInstitutionalBackendUrl(schacHomeOrganization)
    if (!backendUrl) return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })

    const returnUrl = validateReturnUrl(body?.returnUrl ?? payloadInput.returnUrl)

    if (isReservationIntentAction(action)) {
      validateReservationPayload(action, payloadInput)
    } else {
      validateActionPayload(action, payloadInput)
    }

    const executorPromise = getCachedIntentExecutorForInstitution(schacHomeOrganization)
    const adminPromise = getCachedAdminAddress()
    const chainNowPromise = resolveChainNowSec()

    let kind
    let effectiveAction = action
    let preparedReservation = null
    let cancellationSnapshot = null

    if (isReservationIntentAction(action)) {
      if (action === ACTION_CODES.CANCEL_REQUEST_BOOKING) {
        validateCancellationReservationKey(payloadInput.reservationKey)
        cancellationSnapshot = await resolveCancellationReservationSnapshot(payloadInput.reservationKey)
        if (!cancellationSnapshot) {
          return NextResponse.json({ error: 'Reservation not found for cancellation action' }, { status: 404 })
        }
      }

      const contract = action === ACTION_CODES.CANCEL_REQUEST_BOOKING
        ? null
        : await getContractInstance()
      await Promise.all([
        executorPromise,
        adminPromise,
        chainNowPromise,
      ])
      preparedReservation = await prepareReservationData({
        action,
        payloadInput,
        session,
        contract,
        cancellationSnapshot,
      })
      if (preparedReservation.error) return preparedReservation.error
      kind = preparedReservation.kind
      effectiveAction = preparedReservation.action
    } else {
      if (action === ACTION_CODES.CANCEL_BOOKING) {
        validateActionPayload(action, payloadInput)
        cancellationSnapshot = await resolveCancellationReservationSnapshot(payloadInput.reservationKey)
        if (!cancellationSnapshot) {
          return NextResponse.json({ error: 'Reservation not found for cancellation action' }, { status: 404 })
        }
      }
      const [executorAddress, adminAddress, chainNowSec] = await Promise.all([
        executorPromise,
        adminPromise,
        chainNowPromise,
      ])
      kind = 'action'
      preparedReservation = {
        executorAddress,
        adminAddress,
        chainNowSec,
      }
    }

    const executorAddress = preparedReservation.executorAddress || await executorPromise
    const adminAddress = preparedReservation.adminAddress || await adminPromise
    const chainNowSec = preparedReservation.chainNowSec || await chainNowPromise
    const assertionHash = isReservationIntentAction(action)
      ? preparedReservation.assertionHash
      : computeAssertionHash(samlAssertion)

    let intentPackage
    let adminSignature
    let authorization
    let onChain
    let authorizationPromise

    try {
      const coordinated = await withIntentSignerLock(getServerSignerAddress(), async () => {
        const packageValue = kind === 'reservation'
          ? await buildReservationIntent({
            executor: executorAddress,
            signer: adminAddress,
            schacHomeOrganization,
            pucHash,
            assertionHash,
            labId: preparedReservation.labId,
            start: preparedReservation.start,
            end: preparedReservation.end,
            price: preparedReservation.price,
            reservationKey: preparedReservation.reservationKey,
            nowSec: chainNowSec,
            action: effectiveAction,
            requestId: body?.requestId,
          })
          : await buildActionIntent({
            action: effectiveAction,
            executor: executorAddress,
            signer: adminAddress,
            schacHomeOrganization,
            assertionHash,
            pucHash,
            ...resolveActionPayloadInput(payloadInput, effectiveAction, cancellationSnapshot || {}),
            nowSec: chainNowSec,
            requestId: body?.requestId,
          })

        const signature = await signIntentMeta(packageValue.meta, packageValue.typedData)
        const authToken = await getIntentBackendAuthToken({
          backendUrl,
          institutionId: schacHomeOrganization,
          scope: 'intents:authorize',
        })
        const serializedMeta = serializeIntent(packageValue.meta)
        const serializedPayload = serializeIntent(packageValue.payload)
        const authorizationRequest = requestIntentAuthorizationSession({
          backendUrl,
          backendAuthToken: authToken.token,
          payloadKey: kind === 'reservation' ? 'reservationPayload' : 'actionPayload',
          meta: serializedMeta,
          payload: serializedPayload,
          signature,
          samlAssertion,
          stableUserIdMode: getStableUserIdModeFromSession(session),
          returnUrl,
        })
        // Keep a rejection handler attached while the on-chain submission is in flight.
        authorizationRequest.catch(() => {})

        const registrationSubmission = await registerIntentOnChain(
          kind,
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
          authorizationRequest,
          registrationSubmission,
          receipt,
        }
      })

      intentPackage = coordinated.packageValue
      adminSignature = coordinated.signature
      authorizationPromise = coordinated.authorizationRequest
      const registrationSubmission = coordinated.registrationSubmission || {}
      onChain = {
        txHash: registrationSubmission.txHash || null,
        blockNumber: coordinated.receipt?.blockNumber || registrationSubmission.blockNumber || null,
        status: coordinated.receipt ? 'confirmed' : 'submitted',
      }

      if (coordinated.receipt) {
        try {
          const minedAuthToken = await getIntentBackendAuthToken({
            backendUrl,
            institutionId: schacHomeOrganization,
            scope: 'intents:registration-mined',
          })
          const signalResult = await notifyIntentRegistrationMined({
            backendUrl,
            backendAuthToken: minedAuthToken.token,
            requestId: intentPackage.meta.requestId,
            txHash: registrationSubmission.txHash || null,
            blockNumber: coordinated.receipt.blockNumber || null,
          })
          if (signalResult && !signalResult.ok) {
            devLog.warn('[API] Intent registration mined signal was not accepted', signalResult)
          }
        } catch (error) {
          devLog.warn('[API] Intent registration mined signal skipped', error)
        }
      }
    } catch (err) {
      if (err instanceof IntentSignerBusyError) {
        return publicErrorResponse({
          status: 409,
          code: 'INTENT_SIGNER_BUSY',
          message: 'Another intent is being processed. Please retry shortly.',
          error: err,
          context: 'intent-signer-busy',
        })
      }
      if (err instanceof IntentSignerUnavailableError) {
        return publicErrorResponse({
          status: 503,
          code: 'INTENT_SIGNER_COORDINATOR_UNAVAILABLE',
          message: 'The intent request could not be coordinated. Please retry shortly.',
          error: err,
          context: 'intent-signer-coordinator',
        })
      }
      devLog.error('[API] On-chain intent registration failed', err)
      return publicErrorResponse({
        status: 502,
        code: kind === 'reservation' ? 'RESERVATION_INTENT_ONCHAIN_FAILED' : 'ACTION_INTENT_ONCHAIN_FAILED',
        message: kind === 'reservation'
          ? 'The reservation request could not be registered.'
          : 'The action request could not be registered.',
        error: err,
        context: 'intent-onchain',
      })
    }

    try {
      const authResponse = await authorizationPromise
      authorization = authResponse.data
      if (!authResponse.ok) {
        return authorizationErrorResponse(
          authResponse,
          authorization,
          `${kind}-intent-authorization`,
        )
      }

      const normalizedAuthorization = normalizeAuthorizationResponse(authorization)
      if (!hasUsableAuthorizationSession(normalizedAuthorization)) {
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
        context: `${kind}-intent-authorization`,
      })
    }

    const intentForTransport = serializeIntent(intentPackage)
    const authorizationUrl = resolveAuthorizationUrl(backendUrl, authorization)

    return NextResponse.json({
      kind,
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
    })
  } catch (error) {
    devLog.error('[API] Prepare intent failed', error)

    if (error instanceof IntentPrepareValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error, request)
    }

    return publicErrorResponse({
      status: 500,
      code: 'INTENT_PREPARE_FAILED',
      message: 'The intent request could not be prepared.',
      error,
      context: 'intent-prepare',
    })
  }
}
