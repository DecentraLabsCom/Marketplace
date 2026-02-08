import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import getProvider from '@/app/api/contract/utils/getProvider'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import { serializeIntent } from '@/utils/intents/serialize'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import devLog from '@/utils/dev/logger'

function extractOnchainErrorDetails(err) {
  return {
    message: err?.message || null,
    shortMessage: err?.shortMessage || null,
    reason: err?.reason || null,
    code: err?.code || null,
    errorName: err?.errorName || null,
    errorSignature: err?.errorSignature || null,
    data: err?.data || null,
    rpcMessage: err?.info?.error?.message || null,
  }
}

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

function getBackendApiKey() {
  return process.env.INSTITUTION_BACKEND_SP_API_KEY || null
}

function mapAuthorizationErrorCode(message) {
  const normalized = String(message || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'webauthn_credential_not_registered') {
    return 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED'
  }
  if (normalized === 'missing_puc_for_webauthn') {
    return 'MISSING_PUC_FOR_WEBAUTHN'
  }
  return null
}

async function getBackendAuthToken() {
  return marketplaceJwtService.generateIntentBackendToken()
}

async function resolveChainNowSec() {
  try {
    const provider = await getProvider(defaultChain)
    const block = await provider.getBlock('latest')
    const timestamp = Number(block?.timestamp)
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return Math.max(0, timestamp - 30)
    }
  } catch (error) {
    devLog.warn('[API] Failed to resolve chain timestamp, falling back to local time:', error?.message || error)
  }

  const fallback = Math.floor(Date.now() / 1000) - 30
  return fallback > 0 ? fallback : 0
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
      backendAuth = await getBackendAuthToken()
      const apiKey = getBackendApiKey()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${backendAuth.token}`,
      }
      if (apiKey) {
        headers['x-api-key'] = apiKey
      }

      const serializedMeta = serializeIntent(intentPackage.meta)
      const serializedPayload = serializeIntent(intentPackage.payload)

      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents/authorize`, {
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
        const authError =
          authorization?.error ||
          authorization?.message ||
          'Failed to create authorization session'
        const code = mapAuthorizationErrorCode(authError)
        return NextResponse.json(
          code ? { error: authError, code } : { error: authError },
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
      ? `${backendUrl.replace(/\/$/, '')}/intents/authorize/ceremony/${authorization.sessionId}`
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
