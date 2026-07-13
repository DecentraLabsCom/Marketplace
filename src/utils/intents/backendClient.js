import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { secureBackendJsonRequest } from '@/utils/api/secureBackendFetch'

function normalizeBackendUrl(backendUrl) {
  return String(backendUrl || '').replace(/\/$/, '')
}

export function getIntentBackendApiKey() {
  return process.env.INSTITUTION_BACKEND_SP_API_KEY || null
}

export async function getIntentBackendAuthToken() {
  return marketplaceJwtService.generateIntentBackendToken()
}

export function createIntentBackendHeaders(backendAuthToken) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${backendAuthToken}`,
  }

  const apiKey = getIntentBackendApiKey()
  if (apiKey) {
    headers['x-api-key'] = apiKey
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

  const response = await secureBackendJsonRequest(backendUrl, '/intents/authorize', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  return {
    ok: response.ok,
    status: response.status,
    data: response.data,
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

  const response = await secureBackendJsonRequest(
    backendUrl,
    `/intents/${encodeURIComponent(requestId)}/registration-mined`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  )
  return {
    ok: response.ok,
    status: response.status,
    body: response.data,
  }
}

export async function notifyIntentRegistrationFailed({
  backendUrl,
  backendAuthToken,
  requestId,
  event,
  txHash = null,
}) {
  if (!requestId) {
    throw new Error('requestId is required to notify registration failure')
  }
  if (!['registration_reverted', 'registration_dropped'].includes(event)) {
    throw new Error('registration failure event must be reverted or dropped')
  }
  const response = await secureBackendJsonRequest(
    backendUrl,
    `/intents/${encodeURIComponent(requestId)}/registration-failed`,
    {
      method: 'POST',
      headers: createIntentBackendHeaders(backendAuthToken),
      body: JSON.stringify({ event, txHash }),
    },
  )
  return { ok: response.ok, status: response.status, body: response.data }
}

export async function getIntentAuthorizationStatus({
  backendUrl,
  backendAuthToken,
  sessionId,
}) {
  if (!sessionId) {
    throw new Error('authorization sessionId is required')
  }
  const response = await secureBackendJsonRequest(
    backendUrl,
    `/intents/authorize/status/${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      headers: createIntentBackendHeaders(backendAuthToken),
      cache: 'no-store',
    },
  )
  return {
    ok: response.ok,
    status: response.status,
    data: response.data,
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

  const response = await secureBackendJsonRequest(backendUrl, '/intents', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  return {
    ok: response.ok,
    status: response.status,
    body: response.data,
  }
}
