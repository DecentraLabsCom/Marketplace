/**
 * In-memory WebAuthn credential store.
 * NOTE: This is a volatile store intended for the Next.js edge/server runtime.
 * A persistent DB should replace this in production deployments.
 */

// credential caches keyed by stable user identifier (used to be called PUC)
const credentialByUserId = new Map()
const credentialById = new Map()
const registrationChallenges = new Map()
const assertionChallenges = new Map()

/**
 * Persist a verified credential record.
 * @param {Object} record
 * @param {string} record.userId   // stable user identifier (formerly PUC)
 * @param {string} record.credentialId - base64url credential ID
 * @param {string} record.publicKeySpki - base64 SPKI public key
 * @param {string} [record.cosePublicKey] - base64 COSE key
 * @param {number} [record.signCount]
 * @param {string} [record.aaguid]
 * @param {string} [record.status]
 * @param {string} [record.rpId]
 */
export function saveCredential(record) {
  if (!record?.userId || !record?.credentialId) return null
  const normalized = {
    ...record,
    signCount: Number(record.signCount || 0),
    status: record.status || 'active',
    updatedAt: new Date().toISOString(),
  }
  credentialByUserId.set(record.userId, normalized)
  credentialById.set(record.credentialId, normalized)
  return normalized
}

export function getCredentialForUser(userId) {
  if (!userId) return null
  return credentialByUserId.get(userId) || null
}

export function getCredentialById(credentialId) {
  if (!credentialId) return null
  return credentialById.get(credentialId) || null
}

export function setRegistrationChallenge(userId, data) {
  if (!userId || !data?.challenge) return
  registrationChallenges.set(userId, data)
}

export function consumeRegistrationChallenge(userId) {
  if (!userId) return null
  const data = registrationChallenges.get(userId)
  registrationChallenges.delete(userId)
  return data || null
}

export function setAssertionChallenge(requestId, data) {
  if (!requestId || !data?.expectedChallenge) return
  assertionChallenges.set(requestId, data)
}

export function getAssertionChallenge(requestId) {
  if (!requestId) return null
  return assertionChallenges.get(requestId) || null
}

export function clearAssertionChallenge(requestId) {
  if (!requestId) return
  assertionChallenges.delete(requestId)
}

export default {
  saveCredential,
  getCredentialForUser,
  getCredentialById,
  setRegistrationChallenge,
  consumeRegistrationChallenge,
  setAssertionChallenge,
  getAssertionChallenge,
  clearAssertionChallenge,
}
