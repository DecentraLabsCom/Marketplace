/**
 * Unit Tests for FMU-specific Validation
 *
 * Tests validateFmuFields which validates FMU-specific metadata
 * (provider-entered and auto-read from .fmu file).
 */

import { validateFmuFields } from '../labValidation'

describe('validateFmuFields', () => {
  const validFmu = {
    fmuFileName: 'spring-damper.fmu',
    fmiVersion: '2.0',
    simulationType: 'CoSimulation',
    modelVariables: [
      { name: 'mass', causality: 'input', type: 'Real', unit: 'kg', start: 1.0 },
      { name: 'position', causality: 'output', type: 'Real', unit: 'm' },
    ],
    defaultStartTime: 0,
    defaultStopTime: 10,
    defaultStepSize: 0.01,
  }

  test('valid FMU data returns no errors', () => {
    const errors = validateFmuFields(validFmu)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  describe('fmuFileName validation', () => {
    test('required', () => {
      const errors = validateFmuFields({ ...validFmu, fmuFileName: '' })
      expect(errors.fmuFileName).toBe('FMU file name is required')
    })

    test('must end with .fmu', () => {
      const errors = validateFmuFields({ ...validFmu, fmuFileName: 'model.zip' })
      expect(errors.fmuFileName).toContain('.fmu')
    })

    test('accepts valid names', () => {
      const names = ['spring-damper.fmu', 'DC_Motor.fmu', 'my model v2.fmu', 'test.FMU']
      for (const name of names) {
        const errors = validateFmuFields({ ...validFmu, fmuFileName: name })
        expect(errors.fmuFileName).toBeUndefined()
      }
    })

    test('rejects whitespace-only', () => {
      const errors = validateFmuFields({ ...validFmu, fmuFileName: '   ' })
      expect(errors.fmuFileName).toBe('FMU file name is required')
    })
  })

  describe('fmiVersion validation', () => {
    test('is optional when FMU metadata is not present yet', () => {
      const errors = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: '',
        modelVariables: [],
      })
      expect(errors.fmiVersion).toBeUndefined()
    })

    test('accepts 2.0 and 3.0', () => {
      expect(validateFmuFields({ ...validFmu, fmiVersion: '2.0' }).fmiVersion).toBeUndefined()
      expect(validateFmuFields({ ...validFmu, fmiVersion: '3.0' }).fmiVersion).toBeUndefined()
    })
  })

  describe('simulationType validation', () => {
    test('is optional when FMU metadata is not present yet', () => {
      const errors = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: '',
        modelVariables: [],
      })
      expect(errors.simulationType).toBeUndefined()
    })

    test('accepts CoSimulation', () => {
      const errors = validateFmuFields({ ...validFmu, simulationType: 'CoSimulation' })
      expect(errors.simulationType).toBeUndefined()
    })

    test('accepts ModelExchange', () => {
      const errors = validateFmuFields({ ...validFmu, simulationType: 'ModelExchange' })
      expect(errors.simulationType).toBeUndefined()
    })

    test('rejects invalid type', () => {
      const errors = validateFmuFields({ ...validFmu, simulationType: 'Invalid' })
      expect(errors.simulationType).toContain('CoSimulation or ModelExchange')
    })
  })

  describe('modelVariables validation', () => {
    test('is optional when FMU metadata is not present yet', () => {
      const errors1 = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: '',
        modelVariables: [],
      })
      expect(errors1.modelVariables).toBeUndefined()

      const errors2 = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: '',
        modelVariables: null,
      })
      expect(errors2.modelVariables).toBeUndefined()

      const errors3 = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: '',
        modelVariables: undefined,
      })
      expect(errors3.modelVariables).toBeUndefined()
    })

    test('valid array passes', () => {
      const errors = validateFmuFields(validFmu)
      expect(errors.modelVariables).toBeUndefined()
    })
  })

  describe('metadata coherence', () => {
    test('if simulationType is present, fmiVersion and modelVariables become required', () => {
      const errors = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: 'CoSimulation',
        modelVariables: [],
      })
      expect(errors.fmiVersion).toBeDefined()
      expect(errors.modelVariables).toBeDefined()
    })

    test('if modelVariables are present, simulationType and fmiVersion are required', () => {
      const errors = validateFmuFields({
        ...validFmu,
        fmiVersion: '',
        simulationType: '',
        modelVariables: [{ name: 'mass', causality: 'input' }],
      })
      expect(errors.fmiVersion).toBeDefined()
      expect(errors.simulationType).toBeDefined()
    })
  })

  describe('default time parameters', () => {
    test('stopTime must be greater than startTime when both present', () => {
      const errors = validateFmuFields({
        ...validFmu,
        defaultStartTime: 5,
        defaultStopTime: 3,
      })
      expect(errors.defaultStopTime).toContain('greater than start time')
    })

    test('equal start and stop is invalid', () => {
      const errors = validateFmuFields({
        ...validFmu,
        defaultStartTime: 5,
        defaultStopTime: 5,
      })
      expect(errors.defaultStopTime).toBeDefined()
    })

    test('null start/stop is valid (optional)', () => {
      const errors = validateFmuFields({
        ...validFmu,
        defaultStartTime: null,
        defaultStopTime: null,
      })
      expect(errors.defaultStartTime).toBeUndefined()
      expect(errors.defaultStopTime).toBeUndefined()
    })

    test('stepSize must be positive when present', () => {
      const errors1 = validateFmuFields({ ...validFmu, defaultStepSize: 0 })
      expect(errors1.defaultStepSize).toBeDefined()

      const errors2 = validateFmuFields({ ...validFmu, defaultStepSize: -0.01 })
      expect(errors2.defaultStepSize).toBeDefined()
    })

    test('null stepSize is valid (optional)', () => {
      const errors = validateFmuFields({ ...validFmu, defaultStepSize: null })
      expect(errors.defaultStepSize).toBeUndefined()
    })
  })
})
