import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent } from '@/utils/intents/signInstitutionalActionIntent'
import { buildReservationIntent } from '@/utils/intents/signInstitutionalReservationIntent'
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
import {
  signIntentMeta,
  registerIntentOnChain,
  cancelIntentOnChain,
} from '@/utils/intents/adminIntentSigner'
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
import { cancellationStateError, hasCancellationOwnership } from '@/utils/intents/cancellationOwnership'
import { recordRegisteredIntent } from '@/utils/intents/intentLifecycleStore'
import { reconcileTrackedIntents } from '@/utils/intents/intentLifecycleReconciler'
import { isInstitutionalReauthenticationDue } from '@/utils/auth/institutionalSessionClient'

const checkRate = createRateLimiter({ operation: 'intent-prepare', windowMs: 60_000, maxRequests: 10 })

const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase()
const SUBMITTED_REGISTRATION_CLEANUP_TIMEOUT_MS = 15_000

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
    status: Number(reservation?.status),
    renter,
  }
}

async function validateCancellationBeforeIntent({ action, snapshot, session }) {
  const contract = await getContractInstance()
  const { institutionAddress } = await resolveInstitutionAddressFromSession(session, contract)
  if (!hasCancellationOwnership(snapshot, institutionAddress)) {
    return {
      contract,
      error: NextResponse.json(
        { error: 'Reservation does not belong to the current institution' },
        { status: 403 },
      ),
    }
  }

  const stateError = cancellationStateError(action, snapshot)
  if (stateError) {
    return {
      contract,
      error: NextResponse.json({ error: stateError.message }, { status: stateError.status }),
    }
  }
  return { contract, error: null }
}

function resolveAuthorizationMessage(error) {
  const code = mapAuthorizationErrorCode(error)
  const message = code === 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED'
    ? 'No registered passkey was found for this account.'
    : code === 'MISSING_PUC_FOR_WEBAUTHN'
      ? 'The institutional identity could not be verified.'
      : code === 'SAML_REAUTH_REQUIRED'
        ? 'Institutional reauthentication is required.'
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

async function prepareReservationData({ action, payloadInput, session, contract, pucHash, assertionHash, cancellationSnapshot: existingSnapshot }) {
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
      assertionHash,
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
  const price = ownsLab
    ? 0n
    : calculateReservationTotal(pricePerSecond, window.start, window.end)
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
    reservationKey: ethers.solidityPackedKeccak256(
      ['uint256', 'uint32', 'bytes32'],
      [window.labId, window.start, pucHash],
    ),
    assertionHash,
  }
}

function authorizationErrorResponse(authResponse, authorization, context, fields = {}) {
  const authError = authorization?.error || authorization?.message || 'Failed to create authorization session'
  const { code, message } = resolveAuthorizationMessage(authError)
  return publicErrorResponse({
    status: authResponse.status || 502,
    code,
    message,
    error: new Error(String(authError)),
    context,
    fields,
  })
}

function resolveIntentCleanupStatus(cleanupResult) {
  const status = String(cleanupResult?.status || cleanupResult?.stateName || '').toLowerCase()
  return status === 'cancelled' ? 'confirmed' : 'pending'
}

async function cancelRegisteredIntent(requestId, context) {
  if (!requestId) return null
  try {
    return await withIntentSignerLock(
      getServerSignerAddress(),
      () => cancelIntentOnChain(requestId),
    )
  } catch (error) {
    devLog.error('[API] Registered intent cleanup failed', {
      requestId,
      context,
      error: error?.message || String(error),
    })
    return null
  }
}

async function cancelSubmittedIntent(requestId, registrationSubmission, context) {
  if (typeof registrationSubmission?.wait === 'function') {
    let timeoutId
    try {
      const receipt = await Promise.race([
        registrationSubmission.wait(),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve(null), SUBMITTED_REGISTRATION_CLEANUP_TIMEOUT_MS)
        }),
      ])
      if (receipt && (receipt.status === 0 || receipt.status === '0x0' || receipt.status === false)) {
        return { status: 'registration_failed', stateName: 'none' }
      }
    } catch (error) {
      // A reverted or dropped transaction leaves no registered intent to cancel.
      devLog.warn('[API] Submitted intent transaction did not settle', error)
      return null
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }
  return cancelRegisteredIntent(requestId, context)
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, session))
    if (rateLimitResponse) return rateLimitResponse

    try {
      await reconcileTrackedIntents({ limit: 20 })
    } catch (error) {
      devLog.warn('[API] Intent lifecycle reconciliation skipped', error?.message || String(error))
    }

    const body = await request.json().catch(() => ({}))
    const payloadInput = body?.payload || {}
    const action = normalizeIntentAction(body?.action)
    if (action === null) return NextResponse.json({ error: 'Invalid action code' }, { status: 400 })

    const schacHomeOrganization = resolveInstitutionDomainFromSession(session)
    const institutionalSessionToken = session.institutionalBackendSessionToken
    if (!institutionalSessionToken || !session.samlAssertionHash) {
      return NextResponse.json(
        { error: 'Institutional session renewal required', code: 'INSTITUTIONAL_SESSION_REQUIRED' },
        { status: 401 },
      )
    }
    if (isInstitutionalReauthenticationDue(session)) {
      return NextResponse.json(
        { error: 'Institutional SAML reauthentication required', code: 'SAML_REAUTH_REQUIRED' },
        { status: 401 },
      )
    }

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

    let kind
    let effectiveAction = action
    let preparedReservation = null
    let cancellationSnapshot = null
    let executorPromise
    let adminPromise
    let chainNowPromise

    if (isReservationIntentAction(action)) {
      if (action === ACTION_CODES.CANCEL_REQUEST_BOOKING) {
        validateCancellationReservationKey(payloadInput.reservationKey)
        cancellationSnapshot = await resolveCancellationReservationSnapshot(payloadInput.reservationKey)
        if (!cancellationSnapshot) {
          return NextResponse.json({ error: 'Reservation not found for cancellation action' }, { status: 404 })
        }
        const cancellationValidation = await validateCancellationBeforeIntent({
          action,
          snapshot: cancellationSnapshot,
          session,
        })
        if (cancellationValidation.error) return cancellationValidation.error
        executorPromise = getCachedIntentExecutorForInstitution(schacHomeOrganization)
        adminPromise = getCachedAdminAddress()
        chainNowPromise = resolveChainNowSec()
      } else {
        executorPromise = getCachedIntentExecutorForInstitution(schacHomeOrganization)
        adminPromise = getCachedAdminAddress()
        chainNowPromise = resolveChainNowSec()
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
        pucHash,
        assertionHash: session.samlAssertionHash,
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
        const cancellationValidation = await validateCancellationBeforeIntent({
          action,
          snapshot: cancellationSnapshot,
          session,
        })
        if (cancellationValidation.error) return cancellationValidation.error
      }
      executorPromise = getCachedIntentExecutorForInstitution(schacHomeOrganization)
      adminPromise = getCachedAdminAddress()
      chainNowPromise = resolveChainNowSec()
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
      : session.samlAssertionHash

    let intentPackage
    let adminSignature
    let authorization
    let onChain
    let authorizationPromise
    let registrationSubmission

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
          institutionalSessionToken,
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

        return {
          packageValue,
          signature,
          authToken,
          authorizationRequest,
          registrationSubmission,
        }
      })

      intentPackage = coordinated.packageValue
      adminSignature = coordinated.signature
      authorizationPromise = coordinated.authorizationRequest
      registrationSubmission = coordinated.registrationSubmission || {}
      onChain = {
        txHash: registrationSubmission.txHash || null,
        blockNumber: registrationSubmission.blockNumber || null,
        status: 'submitted',
      }

      // The institutional backend reconciles the submitted transaction itself.
      // Its registration gate treats a not-yet-mined intent as retryable, so the
      // browser can start WebAuthn without making the receipt a prerequisite.
      try {
        await recordRegisteredIntent({
          requestId: intentPackage.meta.requestId,
          authorizationSessionId: null,
          institutionDomain: schacHomeOrganization,
          expiresAt: intentPackage.meta.expiresAt.toString(),
          txHash: registrationSubmission.txHash || null,
        })
      } catch (error) {
        devLog.warn('[API] Provisional intent lifecycle record skipped', error)
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
        const cleanupResult = await cancelSubmittedIntent(
          intentPackage?.meta?.requestId,
          registrationSubmission,
          `${kind}-authorization-response`,
        )
        return authorizationErrorResponse(
          authResponse,
          authorization,
          `${kind}-intent-authorization`,
          { intentCleanupStatus: resolveIntentCleanupStatus(cleanupResult) },
        )
      }

      const normalizedAuthorization = normalizeAuthorizationResponse(authorization)
      if (!hasUsableAuthorizationSession(normalizedAuthorization)) {
        devLog.error('[API] Authorization response missing session/url', { authorization })
        await cancelSubmittedIntent(
          intentPackage?.meta?.requestId,
          registrationSubmission,
          `${kind}-authorization-invalid`,
        )
        return NextResponse.json(
          {
            error: 'Invalid authorization response from institutional backend',
            code: 'INTENT_AUTHORIZATION_RESPONSE_INVALID',
          },
          { status: 502 },
        )
      }
      authorization = normalizedAuthorization
      try {
        await recordRegisteredIntent({
          requestId: intentPackage.meta.requestId,
          authorizationSessionId: authorization.sessionId,
          institutionDomain: schacHomeOrganization,
          expiresAt: intentPackage.meta.expiresAt.toString(),
          txHash: registrationSubmission.txHash || null,
        })
      } catch (error) {
        await cancelSubmittedIntent(
          intentPackage.meta.requestId,
          registrationSubmission,
          `${kind}-lifecycle-record`,
        )
        return publicErrorResponse({
          status: 503,
          code: 'INTENT_LIFECYCLE_UNAVAILABLE',
          message: 'The intent could not be registered for lifecycle reconciliation.',
          error,
          context: `${kind}-intent-lifecycle`,
        })
      }
    } catch (err) {
      const cleanupResult = await cancelSubmittedIntent(
        intentPackage?.meta?.requestId,
        registrationSubmission,
        `${kind}-authorization-error`,
      )
      return publicErrorResponse({
        status: 502,
        code: 'INTENT_AUTHORIZATION_FAILED',
        message: 'The institutional authorization request could not be created.',
        error: err,
        context: `${kind}-intent-authorization`,
        fields: { intentCleanupStatus: resolveIntentCleanupStatus(cleanupResult) },
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
