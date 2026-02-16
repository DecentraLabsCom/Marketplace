import { NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { buildReservationIntent, computeReservationAssertionHash } from '@/utils/intents/signInstitutionalReservationIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { serializeIntent } from '@/utils/intents/serialize'
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import getProvider from '@/app/api/contract/utils/getProvider'
import { defaultChain } from '@/utils/blockchain/networkConfig'
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

function normalizeAuthorizationResponse(payload) {
  const candidate = payload?.data || payload?.authorization || payload
  if (!candidate || typeof candidate !== 'object') {
    return { sessionId: null, ceremonyUrl: null, authorizationUrl: null, expiresAt: null }
  }

  return {
    sessionId:
      candidate.sessionId ||
      candidate.session_id ||
      candidate.authorizationSessionId ||
      candidate.authorization_session_id ||
      null,
    ceremonyUrl: candidate.ceremonyUrl || candidate.ceremony_url || null,
    authorizationUrl: candidate.authorizationUrl || candidate.authorization_url || null,
    expiresAt: candidate.expiresAt || candidate.expires_at || null,
  }
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

export async function POST(request) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const { labId, start, timeslot, backendUrl: backendUrlOverride, returnUrl } = body || {}

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

    const schacHomeOrganization = session.schacHomeOrganization || session.affiliation || session.organization || session.organizationName
    if (!schacHomeOrganization) {
      return NextResponse.json({ error: 'Missing schacHomeOrganization in session' }, { status: 400 })
    }

    const puc = getPucFromSession(session)
    if (!puc) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }

    const backendUrl = backendUrlOverride || process.env.INSTITUTION_BACKEND_URL
    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    const executorAddress = await resolveIntentExecutorForInstitution(schacHomeOrganization)
    const adminAddress = await getAdminAddress()
    const priceProvider = await getContractInstance()
    const labData = await priceProvider.getLab(labId)
    const rawPrice = labData?.base?.price ?? labData?.price ?? 0n
    const pricePerSecond = BigInt(rawPrice)

    const end = BigInt(start) + BigInt(timeslot)
    const durationSeconds = BigInt(timeslot)
    const price = pricePerSecond * durationSeconds
    const reservationKey = ethers.solidityPackedKeccak256(['uint256', 'uint32'], [BigInt(labId), BigInt(start)])
    const assertionHash = computeReservationAssertionHash(samlAssertion)

    const chainNowSec = await resolveChainNowSec()
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
      nowSec: chainNowSec,
    })

    const adminSignature = await signIntentMeta(intentPackage.meta, intentPackage.typedData)

    let onChain = null
    try {
      onChain = await registerIntentOnChain('reservation', intentPackage.meta, intentPackage.payload, adminSignature)
    } catch (err) {
      devLog.error('[API] On-chain reservation intent registration failed', err)
      console.error('[API] On-chain reservation intent registration failed', err)
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
          reservationPayload: serializedPayload,
          signature: adminSignature,
          samlAssertion,
          returnUrl: returnUrl || null,
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

      const normalizedAuthorization = normalizeAuthorizationResponse(authorization)
      const hasUsableAuthorization =
        Boolean(normalizedAuthorization.sessionId) ||
        Boolean(normalizedAuthorization.ceremonyUrl) ||
        Boolean(normalizedAuthorization.authorizationUrl)

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
    const fallbackUrl = authorization?.sessionId
      ? `${backendUrl.replace(/\/$/, '')}/intents/authorize/ceremony/${authorization.sessionId}`
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
