/**
 * In-memory WebAuthn credential store.
 * NOTE: This is a volatile store intended for the Next.js edge/server runtime.
 * A persistent DB should replace this in production deployments.
 */

const credentialByPuc = new Map()
const credentialById = new Map()
const registrationChallenges = new Map()
const assertionChallenges = new Map()

/**
 * Persist a verified credential record.
 * @param {Object} record
 * @param {string} record.puc
 * @param {string} record.credentialId - base64url credential ID
 * @param {string} record.publicKeySpki - base64 SPKI public key
 * @param {string} [record.cosePublicKey] - base64 COSE key
 * @param {number} [record.signCount]
 * @param {string} [record.aaguid]
 * @param {string} [record.status]
 * @param {string} [record.rpId]
 */
export function saveCredential(record) {
  if (!record?.puc || !record?.credentialId) return null
  const normalized = {
    ...record,
    signCount: Number(record.signCount || 0),
    status: record.status || 'active',
    updatedAt: new Date().toISOString(),
  }
  credentialByPuc.set(record.puc, normalized)
  credentialById.set(record.credentialId, normalized)
  return normalized
}

export function getCredentialForUser(puc) {
  if (!puc) return null
  return credentialByPuc.get(puc) || null
}

export function getCredentialById(credentialId) {
  if (!credentialId) return null
  return credentialById.get(credentialId) || null
}

export function setRegistrationChallenge(puc, data) {
  if (!puc || !data?.challenge) return
  registrationChallenges.set(puc, data)
}

export function consumeRegistrationChallenge(puc) {
  if (!puc) return null
  const data = registrationChallenges.get(puc)
  registrationChallenges.delete(puc)
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
