import { NextResponse } from 'next/server'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { getOriginFromRequest, getRpId } from '@/utils/webauthn/config'
import { buildIntentChallenge } from '@/utils/webauthn/challenge'
import { getAssertionChallenge, clearAssertionChallenge, getCredentialById, saveCredential } from '@/utils/webauthn/store'
import { registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { serializeIntent } from '@/utils/intents/serialize'
import { getPucFromSession } from '@/utils/webauthn/service'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import devLog from '@/utils/dev/logger'

function getBackendApiKey() {
  return process.env.INSTITUTION_BACKEND_SP_API_KEY || null
}

async function getBackendAuthToken() {
  return marketplaceJwtService.generateIntentBackendToken()
}

export async function POST(request) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const {
      meta,
      payload,
      adminSignature,
      webauthnCredentialId,
      webauthnClientDataJSON,
      webauthnAuthenticatorData,
      webauthnSignature,
      backendUrl: backendUrlOverride,
    } = body || {}

    if (!meta?.requestId) {
      return NextResponse.json({ error: 'Missing intent meta' }, { status: 400 })
    }

    const puc = getPucFromSession(session)
    const samlAssertion = session.samlAssertion
    if (!puc) {
      return NextResponse.json({ error: 'Missing PUC in session' }, { status: 400 })
    }
    if (!samlAssertion) {
      return NextResponse.json({ error: 'Missing SAML assertion in session' }, { status: 400 })
    }

    const stored = getAssertionChallenge(meta.requestId)
    if (!stored) {
      return NextResponse.json({ error: 'No prepared challenge found for this intent' }, { status: 400 })
    }
    if (stored.puc !== puc) {
      return NextResponse.json({ error: 'Challenge PUC mismatch' }, { status: 403 })
    }

    const credentialId = webauthnCredentialId || stored.credentialId
    const credential = getCredentialById(credentialId)
    if (!credential) {
      return NextResponse.json({ error: 'Stored WebAuthn credential not found' }, { status: 400 })
    }

    const metaForUse = stored.meta || meta
    const payloadForUse = stored.payload || payload
    const adminSignatureForUse = stored.adminSignature || adminSignature
    const payloadHash = stored.payloadHash || meta.payloadHash

    const { challenge } = buildIntentChallenge({
      puc,
      credentialId: credential.credentialId,
      meta: metaForUse,
      payloadHash,
    })

    if (stored.expectedChallenge && stored.expectedChallenge !== challenge) {
      return NextResponse.json({ error: 'Challenge mismatch' }, { status: 400 })
    }

    if (!webauthnClientDataJSON || !webauthnAuthenticatorData || !webauthnSignature) {
      return NextResponse.json({ error: 'Incomplete WebAuthn assertion' }, { status: 400 })
    }

    const expectedOrigin = getOriginFromRequest(request)
    const expectedRPID = credential.rpId || getRpId()

    const verification = await verifyAuthenticationResponse({
      response: {
        id: credential.credentialId,
        rawId: credential.credentialId,
        response: {
          clientDataJSON: webauthnClientDataJSON,
          authenticatorData: webauthnAuthenticatorData,
          signature: webauthnSignature,
        },
        type: 'public-key',
        clientExtensionResults: {},
      },
      expectedChallenge: stored.expectedChallenge || challenge,
      expectedOrigin: expectedOrigin ? [expectedOrigin] : [],
      expectedRPID: expectedRPID ? [expectedRPID] : [],
      credential: {
        id: credential.credentialId,
        publicKey: isoBase64URL.toBuffer(credential.cosePublicKey || credential.publicKeySpki, 'base64'),
        counter: credential.signCount || 0,
      },
      requireUserVerification: true,
    })

    if (!verification.verified) {
      return NextResponse.json({ error: 'WebAuthn assertion failed verification' }, { status: 401 })
    }

    if (verification.authenticationInfo?.newCounter !== undefined) {
      saveCredential({ ...credential, signCount: verification.authenticationInfo.newCounter })
    }

    let onChain = null
    try {
      onChain = await registerIntentOnChain('reservation', metaForUse, payloadForUse, adminSignatureForUse)
    } catch (err) {
      devLog.error('[API] On-chain intent registration failed', err)
      clearAssertionChallenge(meta.requestId)
      return NextResponse.json(
        { error: 'Failed to register intent on-chain', details: err?.message || String(err) },
        { status: 502 },
      )
    }

    const backendUrl =
      backendUrlOverride ||
      stored.backendUrl ||
      process.env.INSTITUTION_BACKEND_URL
    let backendResponse = null
    let backendError = null

    const serializedMeta = serializeIntent(metaForUse)
    const serializedPayload = serializeIntent(payloadForUse)

    let backendAuth = null
    if (backendUrl) {
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
        const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            meta: serializedMeta,
            reservationPayload: serializedPayload,
            signature: adminSignatureForUse,
            samlAssertion,
            webauthnCredentialId: credential.credentialId,
            webauthnClientDataJSON,
            webauthnAuthenticatorData,
            webauthnSignature,
          }),
        })
        backendResponse = { status: res.status }
        if (res.ok) {
          backendResponse.body = await res.json().catch(() => ({}))
        } else {
          backendError = `Backend responded with status ${res.status}`
          backendResponse.body = await res.json().catch(() => ({}))
        }
      } catch (err) {
        backendError = err?.message || 'Failed to call backend'
      }
    } else {
      backendError = 'Backend URL not configured'
    }

    clearAssertionChallenge(meta.requestId)

    return NextResponse.json({
      verified: verification.verified,
      intent: serializeIntent({ meta: metaForUse, payload: payloadForUse, payloadHash }),
      onChain,
      backendError,
      backendResponse,
      backendAuthToken: backendAuth?.token || null,
      backendAuthExpiresAt: backendAuth?.expiresAt || null,
    })
  } catch (error) {
    devLog.error('[API] Finalize reservation intent failed', error)

    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }

    return NextResponse.json(
      { error: error.message || 'Failed to finalize reservation intent', code: 'INTENT_FINALIZE_FAILED' },
      { status: 500 },
    )
  }
}
