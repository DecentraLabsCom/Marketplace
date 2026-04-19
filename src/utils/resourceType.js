/**
 * Resource type utilities for distinguishing labs from FMU simulations
 * Used across catalog, provider dashboard, booking, and simulation components
 */

/** @enum {string} */
export const RESOURCE_TYPES = {
  LAB: 'lab',
  FMU: 'fmu',
}

/**
 * Normalize resource type to the on-chain numeric code.
 * @param {unknown} value
 * @returns {0|1}
 */
export function normalizeResourceTypeCode(value) {
  if (value === 1 || value === '1') return 1
  if (typeof value === 'string' && value.trim().toLowerCase() === RESOURCE_TYPES.FMU) return 1
  return 0
}

/**
 * Extract the resourceType from a lab/resource attributes array or object
 * @param {Object} resource - Resource object (may have .attributes or .resourceType)
 * @returns {'lab'|'fmu'} The resource type, defaults to 'lab' for backward compatibility
 */
export function getResourceType(resource) {
  if (!resource) return RESOURCE_TYPES.LAB

  // Direct property (already resolved)
  if (normalizeResourceTypeCode(resource.resourceType) === 1) {
    return RESOURCE_TYPES.FMU
  }

  // NFT metadata attributes array
  if (Array.isArray(resource.attributes)) {
    const attr = resource.attributes.find(a => a.trait_type === 'resourceType')
    if (normalizeResourceTypeCode(attr?.value) === 1) {
      return RESOURCE_TYPES.FMU
    }
  }

  return RESOURCE_TYPES.LAB
}

/**
 * Check if a resource is an FMU simulation
 * @param {Object} resource
 * @returns {boolean}
 */
export function isFmu(resource) {
  return getResourceType(resource) === RESOURCE_TYPES.FMU
}

/**
 * Check if a resource is a traditional remote lab
 * @param {Object} resource
 * @returns {boolean}
 */
export function isLab(resource) {
  return getResourceType(resource) === RESOURCE_TYPES.LAB
}

/**
 * Get a human-readable label for the resource type
 * @param {Object} resource
 * @returns {string}
 */
export function getResourceTypeLabel(resource) {
  return isFmu(resource) ? 'FMU Simulation' : 'Remote Lab'
}

/**
 * Extract maxConcurrentUsers from resource metadata
 * @param {Object} resource
 * @returns {number} Defaults to 1 for labs, uses metadata value for FMUs
 */
export function getMaxConcurrentUsers(resource) {
  if (!resource) return 1
  if (getResourceType(resource) !== RESOURCE_TYPES.FMU) return 1

  // Direct property
  if (resource.maxConcurrentUsers != null) {
    const val = parseInt(resource.maxConcurrentUsers, 10)
    return Number.isFinite(val) && val > 0 ? val : 1
  }

  // NFT metadata attributes
  if (Array.isArray(resource.attributes)) {
    const attr = resource.attributes.find(a => a.trait_type === 'maxConcurrentUsers')
    if (attr?.value != null) {
      const val = parseInt(attr.value, 10)
      return Number.isFinite(val) && val > 0 ? val : 1
    }
  }

  return 1
}

/**
 * Extract FMU-specific metadata fields from resource attributes
 * @param {Object} resource
 * @returns {Object} FMU metadata fields (fmiVersion, simulationType, fmuFileName, etc.)
 */
export function getFmuMetadata(resource) {
  if (!resource) return {}

  const fields = [
    'fmiVersion',
    'simulationType',
    'fmuFileName',
    'defaultStartTime',
    'defaultStopTime',
    'defaultStepSize',
    'modelVariables',
  ]

  const result = {}

  // Try direct properties first
  for (const field of fields) {
    if (resource[field] !== undefined) {
      result[field] = resource[field]
    }
  }

  // Then try attributes array
  if (Array.isArray(resource.attributes)) {
    for (const field of fields) {
      if (result[field] === undefined) {
        const attr = resource.attributes.find(a => a.trait_type === field)
        if (attr?.value !== undefined) {
          result[field] = attr.value
        }
      }
    }
  }

  return result
}

/**
 * Format the simulation type label for UI consumption.
 * @param {string} value
 * @returns {string}
 */
export function formatFmuSimulationType(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (normalized === 'CoSimulation') return 'Co-Simulation'
  if (normalized === 'ModelExchange') return 'Model Exchange'
  return normalized
}

/**
 * Build a human-readable compatibility label from FMU metadata.
 * @param {Object} resourceOrMetadata
 * @returns {string}
 */
export function getFmuCompatibilityLabel(resourceOrMetadata) {
  const hasDirectMetadata = resourceOrMetadata && (
    resourceOrMetadata.fmiVersion !== undefined ||
    resourceOrMetadata.simulationType !== undefined
  )
  const metadata = hasDirectMetadata ? resourceOrMetadata : getFmuMetadata(resourceOrMetadata)
  const version = String(metadata?.fmiVersion || '').trim()
  const simulationType = formatFmuSimulationType(metadata?.simulationType)

  if (version && simulationType) {
    return `Compatible with FMI ${version} ${simulationType}`
  }
  if (version) {
    return `Compatible with FMI ${version}`
  }
  if (simulationType) {
    return `Compatible with ${simulationType}`
  }
  return 'Compatible with FMU simulation'
}
