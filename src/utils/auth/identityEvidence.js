import { keccak256, toUtf8Bytes } from 'ethers'

export const IDENTITY_PROTOCOLS = Object.freeze({
  SAML2: 'saml2',
  OIDC: 'oidc',
  VC: 'vc',
})

export const IDENTITY_EVIDENCE_HASH_VERSIONS = Object.freeze({
  SAML2: 'saml-assertion-c14n-keccak-v2',
  OIDC_ID_TOKEN: 'oidc-id-token-keccak-v1',
  VC_CANONICAL: 'vc-canonical-keccak-v1',
})

const DEFAULT_HASH_VERSION_BY_PROTOCOL = Object.freeze({
  [IDENTITY_PROTOCOLS.SAML2]: IDENTITY_EVIDENCE_HASH_VERSIONS.SAML2,
  [IDENTITY_PROTOCOLS.OIDC]: IDENTITY_EVIDENCE_HASH_VERSIONS.OIDC_ID_TOKEN,
  [IDENTITY_PROTOCOLS.VC]: IDENTITY_EVIDENCE_HASH_VERSIONS.VC_CANONICAL,
})

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Identity evidence ${field} is required`)
  }
  return value.trim()
}

export function hashIdentityEvidence(rawEvidence) {
  return keccak256(toUtf8Bytes(requireText(rawEvidence, 'raw evidence'))).toLowerCase()
}

export function normalizeIdentityEvidenceHash(value) {
  const normalized = requireText(value, 'hash').toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Identity evidence hash must be a bytes32 hex value')
  }
  return normalized
}

export function resolveSessionIdentityEvidence(session) {
  const evidenceHash = session?.identityEvidenceHash || session?.samlAssertionHash
  if (typeof evidenceHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(evidenceHash)) {
    return null
  }
  const isLegacySamlSession = !session?.identityEvidenceHash
    && !session?.identityProtocol
    && Boolean(session?.samlAssertionHash)
  const evidenceHashVersion = session?.identityEvidenceHashVersion
    || session?.samlAssertionHashVersion
    || (isLegacySamlSession ? DEFAULT_HASH_VERSION_BY_PROTOCOL[IDENTITY_PROTOCOLS.SAML2] : null)
    || null
  if (typeof evidenceHashVersion !== 'string' || !evidenceHashVersion.trim()) return null
  const protocol = session?.identityProtocol || IDENTITY_PROTOCOLS.SAML2
  if (protocol === IDENTITY_PROTOCOLS.SAML2
    && evidenceHashVersion !== DEFAULT_HASH_VERSION_BY_PROTOCOL[IDENTITY_PROTOCOLS.SAML2]) {
    return null
  }
  return {
    hash: evidenceHash.toLowerCase(),
    version: evidenceHashVersion.trim(),
    protocol,
    provider: session?.identityProvider || 'edugain',
  }
}

/**
 * Builds the provider-neutral identity evidence envelope used by sessions and
 * backend credentials. Raw protocol material is deliberately not returned.
 */
export function buildIdentityEvidence({
  protocol,
  provider,
  issuer,
  subject,
  stableUserId,
  institutionId,
  evidenceHash,
  evidenceHashVersion,
  rawEvidence,
  issuedAt,
  expiresAt,
} = {}) {
  const normalizedProtocol = requireText(protocol, 'protocol').toLowerCase()
  if (!Object.values(IDENTITY_PROTOCOLS).includes(normalizedProtocol)) {
    throw new Error(`Unsupported identity evidence protocol: ${normalizedProtocol}`)
  }

  const normalizedIssuer = requireText(issuer, 'issuer')
  const normalizedSubject = requireText(subject, 'subject')
  const normalizedStableUserId = requireText(stableUserId, 'stable user ID')
  const normalizedInstitutionId = requireText(institutionId, 'institution ID').toLowerCase()
  const normalizedHash = evidenceHash
    ? normalizeIdentityEvidenceHash(evidenceHash)
    : rawEvidence
      ? hashIdentityEvidence(rawEvidence)
      : null

  if (!normalizedHash) {
    throw new Error('Identity evidence hash is required')
  }

  return {
    protocol: normalizedProtocol,
    provider: requireText(provider, 'provider').toLowerCase(),
    issuer: normalizedIssuer,
    subject: normalizedSubject,
    stableUserId: normalizedStableUserId,
    institutionId: normalizedInstitutionId,
    evidenceHash: normalizedHash,
    evidenceHashVersion: evidenceHashVersion
      || DEFAULT_HASH_VERSION_BY_PROTOCOL[normalizedProtocol],
    ...(issuedAt ? { issuedAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
}

export default {
  IDENTITY_PROTOCOLS,
  IDENTITY_EVIDENCE_HASH_VERSIONS,
  hashIdentityEvidence,
  normalizeIdentityEvidenceHash,
  resolveSessionIdentityEvidence,
  buildIdentityEvidence,
}
