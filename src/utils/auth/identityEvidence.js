import crypto from 'crypto';
import { sortValue } from '@/utils/generalUtils';

/**
 * Converts an identity evidence payload into a canonical JSON string.
 *
 * @param {*} payload - The identity evidence payload to canonicalize.
 * @returns {string} The canonical JSON representation.
 */
export function canonicalizeIdentityEvidencePayload(payload) {
  return JSON.stringify(sortValue(payload));
}

/**
 * Computes a SHA-256 hash for a canonical identity evidence payload.
 *
 * @param {*} payload - The payload used to compute the evidence hash.
 * @returns {string} The hexadecimal SHA-256 hash.
 */
export function computeEvidenceHash(payload) {
  return crypto
    .createHash("sha256")
    .update(canonicalizeIdentityEvidencePayload(payload))
    .digest("hex");
}

/**
 * Builds a validated identity object and attaches its evidence hash.
 *
 * @param {Object} params - Identity evidence parameters.
 * @param {string} params.type - The evidence type.
 * @param {string} params.format - The evidence format.
 * @param {Object} params.claims - The normalized claims.
 * @param {Object} params.metadata - The evidence metadata.
 * @param {*} params.rawEvidence - The original raw evidence payload.
 * @returns {Object} The validated identity object.
 */
export function buildValidatedIdentity({
  type,
  format,
  claims,
  metadata,
  rawEvidence,
}) {
  const canonicalPayload = {
    type,
    format,
    claims,
    metadata,
  };

  return {
    type,
    format,
    claims,
    metadata,
    rawEvidence,
    evidenceHash: computeEvidenceHash(canonicalPayload),
  };
}

/**
 * Resolves the identity information stored in a session object.
 *
 * The function prefers the new IdentityEvidence-based structure and falls back
 * to legacy SAML session data when needed.
 *
 * @param {Object} session - The session object.
 * @returns {Object|null} The resolved identity data, or null if none is available.
 */
export function resolveSessionIdentity(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  if (session.identityEvidence) {
    return {
      identityEvidence: session.identityEvidence,
      normalizedClaims: session.normalizedClaims || session.identityEvidence.claims || null,
      evidenceHash: session.evidenceHash || session.identityEvidence.evidenceHash || null,
      legacySamlAssertion: session.samlAssertion || null,
    };
  }

  // XXX Temporary legacy fallback for SAML-based sessions.
  // Remove once the IdentityEvidence migration is complete.
  if (session.samlAssertion) {
    return {
      identityEvidence: null,
      normalizedClaims: session.normalizedClaims || null,
      evidenceHash: session.evidenceHash || null,
      legacySamlAssertion: session.samlAssertion,
    };
  }

  return null;
}

export default {
  canonicalizeIdentityEvidencePayload,
  computeEvidenceHash,
  buildValidatedIdentity,
  resolveSessionIdentity,
};
