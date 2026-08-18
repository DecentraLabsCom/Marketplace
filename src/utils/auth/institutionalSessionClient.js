import { createInstitutionalServiceToken } from '@/utils/auth/institutionalServiceCredential'
import { MARKETPLACE_SAML_REAUTH_MARGIN_SECONDS } from './sessionConfig'
import {
  institutionalBackendFetch,
  normalizeInstitutionalBackendBaseUrl,
} from '@/utils/api/gatewayProxy'

function normalizeTimestamp(value, field) {
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error(`Invalid ${field}`)
  return timestamp
}

function normalizeSessionResponse(payload) {
  const body = payload?.data || payload
  const token = body?.sessionToken || body?.session_token
  if (typeof token !== 'string' || !token.trim()) throw new Error('Institutional backend session token missing')
  const expiresAt = normalizeTimestamp(body?.expiresAt || body?.expires_at, 'institutional session expiry')
  const reauthenticationAt = normalizeTimestamp(
    body?.reauthenticationAt || body?.reauthentication_at || body?.expiresAt || body?.expires_at,
    'institutional reauthentication time',
  )
  if (reauthenticationAt > expiresAt) throw new Error('Invalid institutional reauthentication time')
  const samlAssertionHash = body?.samlAssertionHash || body?.saml_assertion_hash
  if (typeof samlAssertionHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(samlAssertionHash)) {
    throw new Error('Institutional backend assertion hash missing')
  }
  return {
    institutionalBackendSessionToken: token.trim(),
    institutionalBackendSessionExpiresAt: expiresAt,
    institutionalReauthenticationAt: reauthenticationAt,
    samlAssertionHash: samlAssertionHash.toLowerCase(),
  }
}

async function requestSession({ backendUrl, institutionId, samlAssertion, stableUserIdMode, puc }) {
  const baseUrl = normalizeInstitutionalBackendBaseUrl(backendUrl)
  const serviceToken = await createInstitutionalServiceToken({
    backendUrl: baseUrl,
    institutionId,
    scope: 'intents:session',
    claims: { puc, affiliation: institutionId, stableUserIdMode },
  })
  const response = await institutionalBackendFetch(`${baseUrl}/auth/saml/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken.token}`,
    },
    body: JSON.stringify({ samlAssertion, stableUserIdMode }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || 'Institutional session could not be created')
    error.code = payload?.code || payload?.error || 'INSTITUTIONAL_SESSION_FAILED'
    error.status = response.status
    throw error
  }
  return normalizeSessionResponse(payload)
}

export async function createInstitutionalSessionCredential(options) {
  return requestSession(options)
}

export function isInstitutionalReauthenticationDue(
  session,
  now = Date.now(),
  marginSeconds = MARKETPLACE_SAML_REAUTH_MARGIN_SECONDS,
) {
  const reauthenticationAt = Number(session?.institutionalReauthenticationAt)
  return Number.isFinite(reauthenticationAt)
    && reauthenticationAt <= Number(now) + Number(marginSeconds) * 1000
}

export default {
  createInstitutionalSessionCredential,
  isInstitutionalReauthenticationDue,
}
