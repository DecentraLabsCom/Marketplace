import { mergeAasSimulationVariables } from '../utils/aasSimulationVariables'

describe('mergeAasSimulationVariables', () => {
  test('uses matching AAS metadata for the GLB interface', () => {
    const fmiVariables = [{
      name: 'speed',
      type: 'Float32',
      causality: 'input',
      variability: 'continuous',
      start: 0.25,
      unit: 'm/s',
      min: 0,
      max: 1,
    }]
    const aasVariables = [{
      name: 'speed',
      type: 'Float32',
      causality: 'input',
      variability: 'continuous',
      start: 0.25,
      unit: 'm/s',
      min: 0,
      max: 1,
      displayUnit: { name: 'km/h', factor: 3.6, offset: 0 },
      description: 'Vehicle speed',
    }]

    const result = mergeAasSimulationVariables(aasVariables, fmiVariables)

    expect(result.source).toBe('aas')
    expect(result.variables[0]).toMatchObject({
      type: 'Float32',
      start: 0.25,
      displayUnit: { name: 'km/h', factor: 3.6, offset: 0 },
      description: 'Vehicle speed',
    })
    expect(result.conflicts).toEqual([])
  })

  test('uses FMU values for conflicting execution metadata but keeps AAS display text', () => {
    const result = mergeAasSimulationVariables([{
      name: 'speed',
      type: 'Float32',
      causality: 'input',
      start: 99,
      min: -10,
      description: 'Provider-facing label',
    }], [{
      name: 'speed',
      type: 'Float32',
      causality: 'input',
      start: 0.25,
      min: 0,
    }])

    expect(result.variables[0]).toMatchObject({
      start: 0.25,
      min: 0,
      description: 'Provider-facing label',
    })
    expect(result.conflicts).toEqual([
      { name: 'speed', field: 'start' },
      { name: 'speed', field: 'min' },
    ])
  })

  test('ignores AAS variables that are not declared by the FMU and falls back when identity differs', () => {
    const fmiVariables = [
      { name: 'speed', type: 'Float32', causality: 'input', start: 0.25 },
      { name: 'distance', type: 'Float32', causality: 'output' },
    ]
    const result = mergeAasSimulationVariables([
      { name: 'speed', type: 'Float32', causality: 'output', start: 8 },
      { name: 'ghost', type: 'Real', causality: 'input', start: 1 },
    ], fmiVariables)

    expect(result.source).toBe('fmi')
    expect(result.variables).toEqual(fmiVariables)
    expect(result.conflicts).toEqual([{ name: 'speed', field: 'identity' }])
  })

  test('falls back to FMU metadata when AAS is absent or ambiguous', () => {
    const fmiVariables = [{ name: 'speed', type: 'Real', causality: 'input' }]

    expect(mergeAasSimulationVariables(null, fmiVariables)).toEqual({
      variables: fmiVariables,
      conflicts: [],
      source: 'fmi',
    })
    expect(mergeAasSimulationVariables([
      { name: 'speed', type: 'Real', causality: 'input' },
      { name: 'speed', type: 'Real', causality: 'input' },
    ], fmiVariables).variables).toEqual(fmiVariables)
  })
})
