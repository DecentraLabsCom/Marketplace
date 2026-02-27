import { getAddress } from 'viem'

const PLACEHOLDER_ADDRESS = '0x...'

/**
 * Normalizes an EVM contract address to checksum format.
 * Returns null when the input is empty, placeholder, or invalid.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export const normalizeContractAddress = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed === PLACEHOLDER_ADDRESS) return null

  try {
    return getAddress(trimmed)
  } catch {
    return null
  }
}

/**
 * Checks whether a contract address is configured and valid.
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const hasValidContractAddress = (value) => Boolean(normalizeContractAddress(value))

