import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { buildReservationIntent, computeReservationAssertionHash, ACTION_CODES } from '@/utils/intents/signInstitutionalReservationIntent'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getSamlStableUserIdMode, normalizePuc } from '@/utils/auth/puc'
import { serializeIntent } from '@/utils/intents/serialize'
import { signIntentMeta, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  getIntentBackendAuthToken,
  requestIntentAuthorizationSession,
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
  notifyIntentRegistrationSignal,
} from '@/utils/intents/backendClient'
import { extractOnchainErrorDetails, resolveChainNowSec } from '@/utils/intents/onchainHelpers'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'
import { calculateReservationTotal } from '@/utils/pricing/pricingUnits'
import devLog from '@/utils/dev/logger'
import { getCachedAdminAddress, getCachedIntentExecutorForInstitution } from './cache'

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
    const body = await request.json()
    const { labId, start, end, timeslot, backendUrl: backendUrlOverride, returnUrl } = body || {}

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

    const backendUrl = backendUrlOverride || process.env.INSTITUTION_BACKEND_URL
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

    const intentPackage = await buildReservationIntent({
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
    })

    const adminSignature = await signIntentMeta(intentPackage.meta, intentPackage.typedData)

    let authorization = null
    let backendAuth = null
    let onChain = null
    try {
      backendAuth = await getIntentBackendAuthToken()

      const serializedMeta = serializeIntent(intentPackage.meta)
      const serializedPayload = serializeIntent(intentPackage.payload)

      const registrationPromise = registerIntentOnChain(
        'reservation',
        intentPackage.meta,
        intentPackage.payload,
        adminSignature,
        { waitForReceipt: false },
      )

      const authPromise = requestIntentAuthorizationSession({
        backendUrl,
        backendAuthToken: backendAuth.token,
        payloadKey: 'reservationPayload',
        meta: serializedMeta,
        payload: serializedPayload,
        signature: adminSignature,
        samlAssertion,
        stableUserIdMode: getSamlStableUserIdMode(),
        returnUrl: returnUrl || null,
      })

      const [registrationResult, authResult] = await Promise.allSettled([
        registrationPromise,
        authPromise,
      ])

      if (registrationResult.status === 'rejected') {
        const err = registrationResult.reason
        devLog.error('[API] On-chain reservation intent registration submission failed', err)
        console.error('[API] On-chain reservation intent registration submission failed', err)
        await notifyIntentRegistrationSignal({
          backendUrl,
          backendAuthToken: backendAuth.token,
          requestId: intentPackage.meta.requestId,
          event: 'registration_failed',
          reason: err?.message || String(err),
        }).catch((notifyErr) => {
          devLog.warn('[API] Failed to notify registration failure', notifyErr)
        })
        const onchain = extractOnchainErrorDetails(err)
        return NextResponse.json(
          {
            error: 'Failed to register reservation intent on-chain',
            details: err?.message || String(err),
            onchain,
          },
          { status: 502 },
        )
      }

      const registrationSubmission = registrationResult.value || {}
      onChain = {
        txHash: registrationSubmission.txHash || null,
        blockNumber: registrationSubmission.blockNumber || null,
        status: 'submitted',
      }
      if (onChain.txHash) {
        await notifyIntentRegistrationSignal({
          backendUrl,
          backendAuthToken: backendAuth.token,
          requestId: intentPackage.meta.requestId,
          event: 'registration_submitted',
          txHash: onChain.txHash,
          blockNumber: onChain.blockNumber,
        }).catch((notifyErr) => {
          devLog.warn('[API] Failed to notify registration submission', notifyErr)
        })
      }

      if (authResult.status === 'rejected') {
        throw authResult.reason
      }

      const authResponse = authResult.value

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
      devLog.error('[API] Failed to request reservation authorization', err)
      return NextResponse.json(
        { error: err?.message || 'Failed to request authorization session' },
        { status: 502 },
      )
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
      return handleGuardError(error)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to prepare reservation intent', code: 'INTENT_PREPARE_FAILED' },
      { status: 500 },
    )
  }
}
