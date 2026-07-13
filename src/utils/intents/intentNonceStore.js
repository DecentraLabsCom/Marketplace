/**
 * Derive an unordered, signer-scoped replay nonce from the already-random request id.
 * The Diamond records used nonces, so intent preparation never needs a racy
 * "read next nonce" round-trip.
 */
export function deriveIntentNonce(requestId) {
  if (typeof requestId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(requestId)) {
    throw new Error('requestId must be a bytes32 value');
  }
  const requestIdValue = BigInt(requestId);
  if (requestIdValue === 0n) {
    throw new Error('requestId must be non-zero');
  }
  // Backend DTOs and SQL use a positive signed BIGINT for this field.
  return requestIdValue & ((1n << 63n) - 1n);
}

export default {
  deriveIntentNonce,
};
