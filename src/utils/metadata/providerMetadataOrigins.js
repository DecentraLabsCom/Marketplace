import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { normalizeInstitutionalBackendBaseUrl } from '@/utils/api/gatewayProxy'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function normalizeLabId(labId) {
  if (labId === undefined || labId === null || labId === '') {
    throw new Error('Invalid labId')
  }

  try {
    const normalized = BigInt(labId)
    if (normalized < 0n) throw new Error('Invalid labId')
    return normalized
  } catch {
    throw new Error('Invalid labId')
  }
}

function toOrigin(rawUrl) {
  try {
    const normalized = normalizeInstitutionalBackendBaseUrl(rawUrl)
    const parsed = new URL(normalized)
    return parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

/**
 * Resolve the trusted metadata origins associated with a provider-owned lab.
 * The owner must be a registered provider and its organization/backend
 * association must be present on-chain. No client-supplied origin is used.
 */
export async function resolveProviderMetadataOrigins({
  labId,
  ownerAddress = null,
  contract: suppliedContract = null,
} = {}) {
  const normalizedLabId = normalizeLabId(labId)
  const contract = suppliedContract || await getContractInstance()
  const owner = ownerAddress || await contract.ownerOf(normalizedLabId)

  if (!owner || String(owner).toLowerCase() === ZERO_ADDRESS) {
    return []
  }

  if (typeof contract.isLabProvider === 'function') {
    const isProvider = await contract.isLabProvider(owner)
    if (!isProvider) return []
  }

  if (
    typeof contract.getRegisteredSchacHomeOrganizations !== 'function' ||
    typeof contract.getSchacHomeOrganizationBackend !== 'function'
  ) {
    return []
  }

  const organizations = await contract.getRegisteredSchacHomeOrganizations(owner)
  if (!organizations || typeof organizations[Symbol.iterator] !== 'function') {
    return []
  }

  const origins = await Promise.all(Array.from(organizations).map(async (organization) => {
    try {
      const backendUrl = await contract.getSchacHomeOrganizationBackend(organization)
      return toOrigin(backendUrl)
    } catch {
      return null
    }
  }))

  return [...new Set(origins.filter(Boolean))]
}

export default resolveProviderMetadataOrigins
