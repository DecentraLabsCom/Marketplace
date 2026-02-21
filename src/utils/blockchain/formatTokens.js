/**
 * Token amount formatting utilities for raw blockchain values.
 * Works with string amounts (smallest token units) — suitable for both
 * SSO (API) and Wallet (Wagmi) data that has already been serialized to strings.
 *
 * For formatting BigInt values directly from Wagmi hooks, prefer
 * formatTokenAmount from LabTokenContext (uses viem's formatUnits).
 */

/**
 * Formats a raw token amount (smallest units) to a human-readable string
 * @param {string} rawAmount - Amount in smallest token units (e.g. "800000000")
 * @param {number} decimals - Token decimals (default 6 for $LAB)
 * @returns {string} Formatted amount with 2 decimal places (e.g. "800.00")
 */
export function formatRawAmount(rawAmount, decimals = 6) {
  if (!rawAmount || rawAmount === '0') return '0.00'
  try {
    const value = BigInt(rawAmount)
    const divisor = 10n ** BigInt(decimals)
    const whole = value / divisor
    const fraction = value % divisor
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2)
    return `${whole}.${fractionStr}`
  } catch {
    return '0.00'
  }
}
