import {
  createFmuStateCheckpointCandidate,
  createFmuStateResults,
  createFmuStateSample,
} from '../utils/fmuStateCheckpoint'

test('checkpoint candidates preserve the FMU checkpoint time and outputs', () => {
  expect(createFmuStateCheckpointCandidate({
    checkpoint: { checkpointId: 'saved-state' },
    checkpointTime: 0.9,
    checkpointOutputs: { y: 2.5, unsupported: [1, 2] },
    time: 1,
  }, { gain: 3 }, [
    { time: 0.4, values: { input: 7 } },
    { time: 0.95, values: { input: 9 } },
  ])).toEqual({
    version: 1,
    simTime: 0.9,
    checkpoint: { checkpointId: 'saved-state' },
    sample: { time: 0.9, outputs: { y: 2.5 } },
    modelValues: { gain: 3, input: 7 },
  })
})

test('checkpoint candidate is unavailable without a resumable checkpoint sample', () => {
  expect(createFmuStateCheckpointCandidate({
    checkpoint: { checkpointId: 'saved-state' },
    checkpointTime: 1,
    checkpointOutputs: null,
  })).toBeNull()
})

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
