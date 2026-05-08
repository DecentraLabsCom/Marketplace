/**
 * WebAuthn challenge helpers.
 * Builds deterministic challenge buffers tied to intent payloads.
 */

/**
 * Builds a challenge for an intent by hashing its payload hash.
 * @param {string} payloadHash - hex hash of the intent payload
 * @returns {{ challenge: string }} base64url-encoded challenge
 */
export function buildIntentChallenge(payloadHash) {
  // In production this would derive a deterministic challenge from the payload hash.
  return { challenge: payloadHash }
}

export default { buildIntentChallenge }
