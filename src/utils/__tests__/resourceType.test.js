/**
 * Unit Tests for Resource Type Utilities
 *
 * Tests resource type detection, FMU metadata extraction,
 * and concurrent user limit helpers.
 */

import {
  RESOURCE_TYPES,
  getResourceType,
  normalizeResourceTypeCode,
  isFmu,
  isLab,
  getResourceTypeLabel,
  getMaxConcurrentUsers,
  getFmuMetadata,
} from '../resourceType'

describe('getResourceType', () => {
  test('returns "lab" for null/undefined resource', () => {
    expect(getResourceType(null)).toBe(RESOURCE_TYPES.LAB)
    expect(getResourceType(undefined)).toBe(RESOURCE_TYPES.LAB)
  })

  test('returns "lab" for resource without resourceType', () => {
    expect(getResourceType({ name: 'Test Lab' })).toBe(RESOURCE_TYPES.LAB)
  })

  test('returns "fmu" when resourceType is a direct property', () => {
    expect(getResourceType({ resourceType: 'fmu' })).toBe(RESOURCE_TYPES.FMU)
  })

  test('returns "fmu" when resourceType is numeric 1', () => {
    expect(getResourceType({ resourceType: 1 })).toBe(RESOURCE_TYPES.FMU)
  })

  test('returns "lab" when resourceType is "lab" directly', () => {
    expect(getResourceType({ resourceType: 'lab' })).toBe(RESOURCE_TYPES.LAB)
  })

  test('returns "fmu" from NFT metadata attributes array', () => {
    const resource = {
      attributes: [
        { trait_type: 'resourceType', value: 'fmu' },
        { trait_type: 'maxConcurrentUsers', value: 50 },
      ],
    }
    expect(getResourceType(resource)).toBe(RESOURCE_TYPES.FMU)
  })

  test('returns "lab" when attributes exist but no resourceType', () => {
    const resource = {
      attributes: [
        { trait_type: 'maxConcurrentUsers', value: 1 },
      ],
    }
    expect(getResourceType(resource)).toBe(RESOURCE_TYPES.LAB)
  })

  test('direct property takes precedence over attributes', () => {
    const resource = {
      resourceType: 'fmu',
      attributes: [{ trait_type: 'resourceType', value: 'lab' }],
    }
    expect(getResourceType(resource)).toBe(RESOURCE_TYPES.FMU)
  })
})

describe('normalizeResourceTypeCode', () => {
  test('normalizes FMU variants to 1', () => {
    expect(normalizeResourceTypeCode('fmu')).toBe(1)
    expect(normalizeResourceTypeCode('FMU')).toBe(1)
    expect(normalizeResourceTypeCode(1)).toBe(1)
    expect(normalizeResourceTypeCode('1')).toBe(1)
  })

  test('normalizes LAB/unknown variants to 0', () => {
    expect(normalizeResourceTypeCode('lab')).toBe(0)
    expect(normalizeResourceTypeCode(0)).toBe(0)
    expect(normalizeResourceTypeCode(undefined)).toBe(0)
  })
})

describe('isFmu / isLab', () => {
  test('isFmu returns true for FMU resources', () => {
    expect(isFmu({ resourceType: 'fmu' })).toBe(true)
    expect(isFmu({ resourceType: 'lab' })).toBe(false)
    expect(isFmu(null)).toBe(false)
  })

  test('isLab returns true for lab or missing resources', () => {
    expect(isLab({ resourceType: 'lab' })).toBe(true)
    expect(isLab(null)).toBe(true)
    expect(isLab({ name: 'No type' })).toBe(true)
    expect(isLab({ resourceType: 'fmu' })).toBe(false)
  })
})

describe('getResourceTypeLabel', () => {
  test('returns correct labels', () => {
    expect(getResourceTypeLabel({ resourceType: 'fmu' })).toBe('FMU Simulation')
    expect(getResourceTypeLabel({ resourceType: 'lab' })).toBe('Remote Lab')
    expect(getResourceTypeLabel(null)).toBe('Remote Lab')
  })
})

describe('getMaxConcurrentUsers', () => {
  test('returns 1 for null resource', () => {
    expect(getMaxConcurrentUsers(null)).toBe(1)
  })

  test('returns direct property value only for FMU resources', () => {
    expect(getMaxConcurrentUsers({ resourceType: 'fmu', maxConcurrentUsers: 50 })).toBe(50)
    expect(getMaxConcurrentUsers({ resourceType: 'lab', maxConcurrentUsers: 50 })).toBe(1)
  })

  test('returns 1 for invalid values', () => {
    expect(getMaxConcurrentUsers({ maxConcurrentUsers: 0 })).toBe(1)
    expect(getMaxConcurrentUsers({ maxConcurrentUsers: -5 })).toBe(1)
    expect(getMaxConcurrentUsers({ maxConcurrentUsers: 'abc' })).toBe(1)
  })

  test('extracts from attributes array for FMU resources', () => {
    const resource = {
      attributes: [
        { trait_type: 'resourceType', value: 'fmu' },
        { trait_type: 'maxConcurrentUsers', value: 25 },
      ],
    }
    expect(getMaxConcurrentUsers(resource)).toBe(25)
  })

  test('ignores attributes for LAB resources', () => {
    const resource = {
      attributes: [
        { trait_type: 'maxConcurrentUsers', value: 25 },
      ],
    }
    expect(getMaxConcurrentUsers(resource)).toBe(1)
  })

  test('parses string values for FMU resources', () => {
    expect(getMaxConcurrentUsers({ resourceType: 'fmu', maxConcurrentUsers: '100' })).toBe(100)
  })
})

describe('getFmuMetadata', () => {
  test('returns empty object for null resource', () => {
    expect(getFmuMetadata(null)).toEqual({})
  })

  test('extracts direct properties', () => {
    const resource = {
      fmiVersion: '2.0',
      simulationType: 'CoSimulation',
      fmuFileName: 'spring-damper.fmu',
      defaultStartTime: 0,
      defaultStopTime: 10,
      defaultStepSize: 0.01,
      modelVariables: [{ name: 'mass', causality: 'input' }],
    }
    const meta = getFmuMetadata(resource)
    expect(meta.fmiVersion).toBe('2.0')
    expect(meta.simulationType).toBe('CoSimulation')
    expect(meta.fmuFileName).toBe('spring-damper.fmu')
    expect(meta.defaultStartTime).toBe(0)
    expect(meta.defaultStopTime).toBe(10)
    expect(meta.defaultStepSize).toBe(0.01)
    expect(meta.modelVariables).toHaveLength(1)
  })

  test('extracts from attributes array', () => {
    const resource = {
      attributes: [
        { trait_type: 'fmiVersion', value: '3.0' },
        { trait_type: 'simulationType', value: 'ModelExchange' },
        { trait_type: 'fmuFileName', value: 'motor.fmu' },
      ],
    }
    const meta = getFmuMetadata(resource)
    expect(meta.fmiVersion).toBe('3.0')
    expect(meta.simulationType).toBe('ModelExchange')
    expect(meta.fmuFileName).toBe('motor.fmu')
  })

  test('direct properties take precedence over attributes', () => {
    const resource = {
      fmiVersion: '2.0',
      attributes: [{ trait_type: 'fmiVersion', value: '3.0' }],
    }
    const meta = getFmuMetadata(resource)
    expect(meta.fmiVersion).toBe('2.0')
  })

  test('ignores non-FMU fields', () => {
    const resource = { name: 'Test', price: 100, fmiVersion: '2.0' }
    const meta = getFmuMetadata(resource)
    expect(Object.keys(meta)).toEqual(['fmiVersion'])
    expect(meta.name).toBeUndefined()
  })
})
