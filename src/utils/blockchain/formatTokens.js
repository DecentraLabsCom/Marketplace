import { CREDIT_DECIMALS, formatRawCredits } from '@/utils/blockchain/creditUnits'

/**
 * Credit amount formatting utilities for raw blockchain values.
 * Works with string amounts (smallest credit units) — suitable for both
 * SSO (API) and Wallet (Wagmi) data that has already been serialized to strings.
 *
 * For formatting BigInt values directly from Wagmi hooks, prefer
 * formatTokenAmount from LabTokenContext (uses viem's formatUnits).
 */

/**
 * Formats a raw credit amount (smallest units) to a human-readable string
 * @param {string} rawAmount - Amount in smallest credit units (e.g. "8000")
 * @param {number} decimals - Credit decimals (default 5)
 * @returns {string} Formatted amount trimmed to the canonical scale
 */
export function formatRawAmount(rawAmount, decimals = CREDIT_DECIMALS) {
  return formatRawCredits(rawAmount, decimals)
}
