import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  getIntentAuthorizationStatus,
  getIntentBackendAuthToken,
  notifyIntentRegistrationMined,
  notifyIntentRegistrationFailed,
} from '@/utils/intents/backendClient'
import devLog from '@/utils/dev/logger'

const normalize = (value) => String(value || '').trim().toLowerCase()
const intentState = (intent) => Number(intent?.state ?? intent?.[8] ?? 0)

function existingIntentMatches(existing, meta) {
  const field = (name, index) => existing?.[name] ?? existing?.[index]
  return normalize(field('requestId', 0)) === normalize(meta?.requestId)
    && normalize(field('signer', 1)) === normalize(meta?.signer)
    && normalize(field('executor', 2)) === normalize(meta?.executor)
    && Number(field('action', 3)) === Number(meta?.action)
    && normalize(field('payloadHash', 4)) === normalize(meta?.payloadHash)
    && BigInt(field('nonce', 5)?.toString?.() ?? field('nonce', 5) ?? 0) === BigInt(meta?.nonce ?? 0)
}

export async function POST(request) {
  let registrationFailureContext = null
  try {
    const session = await requireAuth()
    const body = await request.json().catch(() => ({}))
    const { kind, intent, adminSignature, authorizationSessionId } = body || {}
    const meta = intent?.meta
    const payload = intent?.payload

    if (!['action', 'reservation'].includes(kind) || !meta || !payload || !adminSignature) {
      return NextResponse.json({ error: 'Invalid intent finalization payload' }, { status: 400 })
    }
    if (!authorizationSessionId) {
      return NextResponse.json({ error: 'Missing authorization session' }, { status: 400 })
    }

    const institutionDomain = resolveInstitutionDomainFromSession(session)
    if (normalize(payload.schacHomeOrganization) !== normalize(institutionDomain)) {
      return NextResponse.json({ error: 'Intent institution does not match authenticated session' }, { status: 403 })
    }

    const backendUrl = await resolveInstitutionalBackendUrl(institutionDomain)
    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }
    const backendAuth = await getIntentBackendAuthToken()
    registrationFailureContext = {
      backendUrl,
      backendAuthToken: backendAuth.token,
      requestId: meta.requestId,
    }
    const authorization = await getIntentAuthorizationStatus({
      backendUrl,
      backendAuthToken: backendAuth.token,
      sessionId: authorizationSessionId,
    })
    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.data?.error || 'Unable to verify intent authorization' },
        { status: authorization.status || 502 },
      )
    }
    if (normalize(authorization.data?.status) !== 'success'
      || normalize(authorization.data?.requestId) !== normalize(meta.requestId)) {
      return NextResponse.json({ error: 'Intent has not been authorized' }, { status: 409 })
    }

    const contract = await getContractInstance('diamond', true)
    const existing = await contract.getIntent(meta.requestId)
    let onChain
    if (intentState(existing) !== 0) {
      if (!existingIntentMatches(existing, meta)) {
        return NextResponse.json({ error: 'On-chain intent conflicts with authorized payload' }, { status: 409 })
      }
      onChain = { status: 'mined', txHash: null, blockNumber: null, alreadyRegistered: true }
    } else {
      const registration = await registerIntentOnChain(kind, meta, payload, adminSignature)
      onChain = {
        status: 'mined',
        txHash: registration?.txHash || null,
        blockNumber: registration?.blockNumber || null,
        alreadyRegistered: false,
      }
    }

    const signal = await notifyIntentRegistrationMined({
      backendUrl,
      backendAuthToken: backendAuth.token,
      requestId: meta.requestId,
      txHash: onChain.txHash,
      blockNumber: onChain.blockNumber,
    })
    if (!signal?.ok) {
      devLog.warn('[API] Intent registration mined but backend signal was not accepted', {
        requestId: meta.requestId,
        status: signal?.status,
      })
    }

    return NextResponse.json({
      requestId: meta.requestId,
      onChain,
      registrationNotification: signal?.ok ? 'accepted' : 'pending_reconciliation',
    })
  } catch (error) {
    devLog.error('[API] Finalize authorized intent failed', error)
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }
    const receiptStatus = error?.receipt?.status
    const failureEvent = Number(receiptStatus) === 0
      ? 'registration_reverted'
      : (error?.code === 'TRANSACTION_REPLACED' && error?.cancelled
        ? 'registration_dropped'
        : null)
    if (failureEvent && registrationFailureContext) {
      try {
        await notifyIntentRegistrationFailed({
          ...registrationFailureContext,
          event: failureEvent,
          txHash: error?.receipt?.hash || error?.receipt?.transactionHash || error?.transactionHash || null,
        })
      } catch (notificationError) {
        devLog.warn('[API] Intent registration failure signal was not accepted', {
          requestId: registrationFailureContext.requestId,
          error: notificationError?.message,
        })
      }
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to finalize authorized intent' },
      { status: 502 },
    )
  }
}
