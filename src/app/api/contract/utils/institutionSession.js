/**
 * Shared utilities for institutional session handling
 * Used by API endpoints that need to resolve institution address and PUC from SSO session
 */

import { BadRequestError } from '@/utils/auth/guards'
import { isAddress } from 'viem'
import { getNormalizedPucFromSession } from '@/utils/auth/puc'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/**
 * Normalizes an organization domain to lowercase with strict validation
 * @param {string} domain - The organization domain from session
 * @returns {string} Normalized domain
 * @throws {BadRequestError} If domain is invalid
 */
export function normalizeOrganizationDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new BadRequestError('SSO session missing affiliation domain')
  }

  const input = domain.trim()
  if (input.length < 3 || input.length > 255) {
    throw new BadRequestError('Invalid organization domain length')
  }

  let normalized = ''
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i)

    // Uppercase A-Z -> lowercase a-z
    if (code >= 0x41 && code <= 0x5a) {
      code += 32
    }

    const ch = String.fromCharCode(code)

    const isLower = code >= 0x61 && code <= 0x7a
    const isDigit = code >= 0x30 && code <= 0x39
    const isDash = ch === '-'
    const isDot = ch === '.'

    if (!isLower && !isDigit && !isDash && !isDot) {
      throw new BadRequestError('Invalid character in organization domain')
    }

    normalized += ch
  }

  return normalized
}

/**
 * Extracts and validates the Personal Unique Code (PUC) from session
 * @param {Object} session - The authenticated session object
 * @returns {string} Trimmed PUC string
 * @throws {BadRequestError} If PUC is missing or invalid
 */
export function getSessionPuc(session) {
  const puc = getNormalizedPucFromSession(session)

  if (!puc || typeof puc !== 'string') {
    throw new BadRequestError('SSO session missing personalUniqueCode')
  }

  return puc
}

/**
 * Resolves the institution wallet address from an SSO session
 * Uses the affiliation domain to lookup the registered institution address on-chain
 * @param {Object} session - The authenticated session object
 * @param {Object} contract - The contract instance with resolveSchacHomeOrganization method
 * @returns {Promise<{institutionAddress: string, normalizedDomain: string}>}
 * @throws {BadRequestError} If institution is not registered or address is invalid
 */
export async function resolveInstitutionAddressFromSession(session, contract) {
  const affiliationDomain = session?.affiliation || session?.schacHomeOrganization

  const normalizedDomain = normalizeOrganizationDomain(affiliationDomain)
  const wallet = await contract.resolveSchacHomeOrganization(normalizedDomain)
  const lowerWallet = wallet?.toLowerCase?.() || wallet

  if (!lowerWallet || lowerWallet === ZERO_ADDRESS) {
    throw new BadRequestError('Institution not registered for current session domain')
  }

  if (!isAddress(lowerWallet)) {
    throw new BadRequestError('Resolved institution address is invalid')
  }

  return { institutionAddress: lowerWallet, normalizedDomain }
}
