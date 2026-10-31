import { appendSimulationSamples } from '../utils/simulationSamples'

describe('simulation stream samples', () => {
  test('appends scalar step events and chunked series to one aligned timeline', () => {
    const time = []
    const outputs = {}

    appendSimulationSamples(time, outputs, 0, { position: 1 }, false)
    appendSimulationSamples(time, outputs, [0.1, 0.2], {
      position: [2, 3],
      vector: [[4, 5], [6, 7]],
    })

    expect(time).toEqual([0, 0.1, 0.2])
    expect(outputs).toEqual({
      position: [1, 2, 3],
      vector: [null, [4, 5], [6, 7]],
    })
  })

  test('preserves array-valued outputs from a single FMU step', () => {
    const time = []
    const outputs = {}

    appendSimulationSamples(time, outputs, 1, { vector: [4, 5] }, false)

    expect(time).toEqual([1])
    expect(outputs).toEqual({ vector: [[4, 5]] })
  })
})
