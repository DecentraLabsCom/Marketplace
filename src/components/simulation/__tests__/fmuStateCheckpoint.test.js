import { createFmuStateResults, createFmuStateSample } from '../utils/fmuStateCheckpoint'

describe('FMU state display samples', () => {
  test('keeps finite scalar outputs for scene restoration', () => {
    expect(createFmuStateSample(4, {
      position: 1.25,
      enabled: true,
      invalid: Number.NaN,
      vector: [1, 2],
      text: 'ignored',
    })).toEqual({ time: 4, outputs: { position: 1.25, enabled: true } })
  })

  test('converts a saved sample to the results shape used by GLB viewers', () => {
    expect(createFmuStateResults({ time: 4, outputs: { position: 1.25, enabled: true } }, 'CoSimulation')).toEqual({
      time: [4],
      outputs: { position: [1.25], enabled: [true] },
      outputVariables: ['position', 'enabled'],
      simulationTime: 4,
      fmiType: 'CoSimulation',
    })
  })
})
