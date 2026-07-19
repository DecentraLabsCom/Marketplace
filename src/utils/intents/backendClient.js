import { createInstitutionalServiceToken } from '@/utils/auth/institutionalServiceCredential'
import {
  institutionalBackendFetch,
  normalizeInstitutionalBackendBaseUrl,
} from '@/utils/api/gatewayProxy'

function normalizeBackendUrl(backendUrl) {
  return normalizeInstitutionalBackendBaseUrl(backendUrl)
}

export async function getIntentBackendAuthToken({ backendUrl, institutionId, scope }) {
  return createInstitutionalServiceToken({ backendUrl, institutionId, scope })
}

export function createIntentBackendHeaders(backendAuthToken) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${backendAuthToken}`,
  }

  return headers
}

export function mapAuthorizationErrorCode(message) {
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

export function normalizeAuthorizationResponse(payload) {
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

export function hasUsableAuthorizationSession(authorization) {
  return Boolean(
    authorization?.sessionId ||
    authorization?.ceremonyUrl ||
    authorization?.authorizationUrl
  )
}

export function resolveAuthorizationUrl(backendUrl, authorization) {
  const fallbackUrl = authorization?.sessionId
    ? `${normalizeBackendUrl(backendUrl)}/intents/authorize/ceremony/${authorization.sessionId}`
    : null
  return authorization?.ceremonyUrl || authorization?.authorizationUrl || fallbackUrl
}

export async function requestIntentAuthorizationSession({
  backendUrl,
  backendAuthToken,
  payloadKey,
  meta,
  payload,
  signature,
  samlAssertion,
  stableUserIdMode = null,
  returnUrl = null,
}) {
  const headers = createIntentBackendHeaders(backendAuthToken)
  const body = {
    meta,
    signature,
    samlAssertion,
    stableUserIdMode,
    returnUrl,
    [payloadKey]: payload,
  }

  const res = await institutionalBackendFetch(`${normalizeBackendUrl(backendUrl)}/intents/authorize`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    data,
  }
}

export async function notifyIntentRegistrationMined({
  backendUrl,
  backendAuthToken,
  requestId,
  txHash = null,
  blockNumber = null,
}) {
  if (!requestId) {
    throw new Error('requestId is required to notify mined registration')
  }
  const headers = createIntentBackendHeaders(backendAuthToken)
  const body = {
    event: 'registration_mined',
    txHash,
    blockNumber,
  }

  const res = await institutionalBackendFetch(
    `${normalizeBackendUrl(backendUrl)}/intents/${encodeURIComponent(requestId)}/registration-mined`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  )

  const responseBody = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    body: responseBody,
  }
}

export async function submitIntentExecutionToBackend({
  backendUrl,
  backendAuthToken,
  payloadKey,
  meta,
  payload,
  signature,
  samlAssertion,
  webauthnCredentialId,
  webauthnClientDataJSON,
  webauthnAuthenticatorData,
  webauthnSignature,
}) {
  const headers = createIntentBackendHeaders(backendAuthToken)
  const body = {
    meta,
    signature,
    samlAssertion,
    webauthnCredentialId,
    webauthnClientDataJSON,
    webauthnAuthenticatorData,
    webauthnSignature,
    [payloadKey]: payload,
  }

  const res = await institutionalBackendFetch(`${normalizeBackendUrl(backendUrl)}/intents`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const responseBody = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    body: responseBody,
  }
}
