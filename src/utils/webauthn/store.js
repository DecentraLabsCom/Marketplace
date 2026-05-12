/**
 * In-memory WebAuthn credential store (local cache for the Marketplace runtime).
 * Credentials registered via the institutional backend are mirrored here on callback.
 * NOTE: This is volatile — a persistent DB should replace it in production.
 */

const credentialByUserId = new Map()
const credentialById = new Map()
const assertionChallenges = new Map()

/**
 * Persist a verified credential record received from the institutional backend callback.
 * @param {Object} record
 * @param {string} record.userId
 * @param {string} record.credentialId
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

/**
 * Retrieve a credential by its ID.
 * @param {string} id 
 */
export function getCredentialById(id) {
  return credentialById.get(id)
}

/**
 * Retrieve an assertion challenge by requestId.
 * @param {string} requestId 
 */
export function getAssertionChallenge(requestId) {
  return assertionChallenges.get(requestId)
}

/**
 * Clear an assertion challenge.
 * @param {string} requestId 
 */
export function clearAssertionChallenge(requestId) {
  return assertionChallenges.delete(requestId)
}

/**
 * Save an assertion challenge (used by prepare routes if implemented).
 * @param {string} requestId 
 * @param {Object} data 
 */
export function saveAssertionChallenge(requestId, data) {
  assertionChallenges.set(requestId, data)
  return data
}

export default {
  saveCredential,
  getCredentialById,
  getAssertionChallenge,
  clearAssertionChallenge,
  saveAssertionChallenge,
}
