import { createInstitutionalServiceToken } from '@/utils/auth/institutionalServiceCredential'
import { MARKETPLACE_SAML_REAUTH_MARGIN_SECONDS } from './sessionConfig'
import {
  institutionalBackendFetch,
  normalizeInstitutionalBackendBaseUrl,
} from '@/utils/api/gatewayProxy'
import { INSTITUTIONAL_ASSERTION_HASH_VERSION } from './assertionHashVersion'

export { INSTITUTIONAL_ASSERTION_HASH_VERSION }

function normalizeTimestamp(value, field) {
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error(`Invalid ${field}`)
  return timestamp
}

function normalizeSessionResponse(payload, { expectedProtocol = null } = {}) {
  const body = payload?.data || payload
  const token = body?.sessionToken || body?.session_token
  if (typeof token !== 'string' || !token.trim()) throw new Error('Institutional backend session token missing')
  const expiresAt = normalizeTimestamp(body?.expiresAt || body?.expires_at, 'institutional session expiry')
  const reauthenticationAt = normalizeTimestamp(
    body?.reauthenticationAt || body?.reauthentication_at || body?.expiresAt || body?.expires_at,
    'institutional reauthentication time',
  )
  if (reauthenticationAt > expiresAt) throw new Error('Invalid institutional reauthentication time')
  const identityEvidenceHash = body?.identityEvidenceHash
    || body?.identity_evidence_hash
    || body?.samlAssertionHash
    || body?.saml_assertion_hash
  if (typeof identityEvidenceHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(identityEvidenceHash)) {
    throw new Error('Institutional backend assertion hash missing')
  }
  const identityEvidenceHashVersion = body?.identityEvidenceHashVersion
    || body?.identity_evidence_hash_version
    || body?.samlAssertionHashVersion
    || body?.saml_assertion_hash_version
  if (typeof identityEvidenceHashVersion !== 'string' || !identityEvidenceHashVersion.trim()) {
    throw new Error('Unsupported institutional backend identity evidence hash version')
  }
  if (expectedProtocol === 'saml2' && identityEvidenceHashVersion !== INSTITUTIONAL_ASSERTION_HASH_VERSION) {
    throw new Error('Unsupported institutional backend assertion hash version')
  }
  const identityProtocol = body?.identityProtocol || body?.identity_protocol || 'saml2'
  if (expectedProtocol && identityProtocol !== expectedProtocol) {
    throw new Error('Institutional backend identity protocol mismatch')
  }
  return {
    institutionalBackendSessionToken: token.trim(),
    institutionalBackendSessionExpiresAt: expiresAt,
    institutionalReauthenticationAt: reauthenticationAt,
    samlAssertionHash: identityEvidenceHash.toLowerCase(),
    samlAssertionHashVersion: identityEvidenceHashVersion,
    identityEvidenceHash: identityEvidenceHash.toLowerCase(),
    identityEvidenceHashVersion,
    identityProtocol,
    identityProvider: body?.identityProvider || body?.identity_provider || 'edugain',
    identityIssuer: body?.identityIssuer || body?.identity_issuer || null,
    identitySubject: body?.identitySubject || body?.identity_subject || null,
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
  return normalizeSessionResponse(payload, { expectedProtocol: 'saml2' })
}

async function requestIdentitySession({
  backendUrl,
  institutionId,
  stableUserIdMode,
  identityEvidence,
  puc,
  externalIdToken,
  identityNonce,
}) {
  if (!identityEvidence || identityEvidence.protocol === 'saml2') {
    throw new Error('Non-SAML identity evidence is required')
  }
  const baseUrl = normalizeInstitutionalBackendBaseUrl(backendUrl)
  const serviceToken = await createInstitutionalServiceToken({
    backendUrl: baseUrl,
    institutionId,
    scope: 'intents:session',
    claims: {
      puc,
      stableUserId: identityEvidence.stableUserId,
      affiliation: institutionId,
      stableUserIdMode,
      identityProtocol: identityEvidence.protocol,
      identityProvider: identityEvidence.provider,
      identityIssuer: identityEvidence.issuer,
      identitySubject: identityEvidence.subject,
      identityEvidenceHash: identityEvidence.evidenceHash,
      identityEvidenceHashVersion: identityEvidence.evidenceHashVersion,
      identityNonce,
    },
  })
  const response = await institutionalBackendFetch(`${baseUrl}/auth/identity/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken.token}`,
    },
    body: JSON.stringify({
      stableUserIdMode,
      ...(typeof externalIdToken === 'string' && externalIdToken.trim()
        ? { externalIdToken: externalIdToken.trim() }
        : {}),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || 'Institutional identity session could not be created')
    error.code = payload?.code || payload?.error || 'INSTITUTIONAL_IDENTITY_SESSION_FAILED'
    error.status = response.status
    throw error
  }
  return normalizeSessionResponse(payload, { expectedProtocol: identityEvidence.protocol })
}

export async function createInstitutionalSessionCredential(options) {
  return requestSession(options)
}

export async function createInstitutionalIdentitySession(options) {
  return requestIdentitySession(options)
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
  createInstitutionalIdentitySession,
  isInstitutionalReauthenticationDue,
}
