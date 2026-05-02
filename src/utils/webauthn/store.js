/**
 * In-memory WebAuthn credential store (local cache for the Marketplace runtime).
 * Credentials registered via the institutional backend are mirrored here on callback.
 * NOTE: This is volatile — a persistent DB should replace it in production.
 */

const credentialByUserId = new Map()
const credentialById = new Map()

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

export default {
  saveCredential,
}
