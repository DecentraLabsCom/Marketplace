import { isoBase64URL } from '@simplewebauthn/server/helpers'

function toPlainString(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'bigint') return value.toString()
  return String(value)
}

/**
 * Build the deterministic WebAuthn challenge string for intents:
 * puc|requestId|payloadHash|nonce|requestedAt|expiresAt|action
 * @param {Object} params
 * @param {string} params.puc
 * @param {Object} params.meta
 * @param {string} params.payloadHash
 * @returns {{ challengeString: string, challenge: string }}
 */
export function buildIntentChallenge({ puc, meta, payloadHash }) {
  const challengeString = [
    puc ? puc.toLowerCase() : '',
    meta?.requestId,
    payloadHash || meta?.payloadHash || '',
    toPlainString(meta?.nonce),
    toPlainString(meta?.requestedAt),
    toPlainString(meta?.expiresAt),
    toPlainString(meta?.action),
  ].join('|')

  return {
    challengeString,
    challenge: isoBase64URL.fromUTF8String(challengeString),
  }
}

export default {
  buildIntentChallenge,
}
