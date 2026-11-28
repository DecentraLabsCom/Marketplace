import {
  normalizeSimulationStreamEvent,
  readNdjsonStream,
  selectSimulationOutputs,
} from '@decentralabs/digital-twin-app-protocol/simulation-stream'

function createReadableResponse(chunks) {
  const encoder = new TextEncoder()
  const values = chunks.map((chunk) => encoder.encode(chunk))
  return {
    body: {
      getReader: () => ({
        read: jest.fn()
          .mockImplementationOnce(async () => ({ done: false, value: values[0] }))
          .mockImplementationOnce(async () => ({ done: false, value: values[1] }))
          .mockImplementationOnce(async () => ({ done: true })),
        cancel: jest.fn().mockResolvedValue(undefined),
        releaseLock: jest.fn(),
      }),
    },
  }
}

test('reads complete NDJSON events across chunks and flushes a final line without newline', async () => {
  const response = createReadableResponse(['{"type":"started"}\n{"type":"sim.', 'step","time":1,"outputs":{"x":2}}'])
  const received = []

  await readNdjsonStream(response, async (event) => {
    await Promise.resolve()
    received.push(event)
  })

  expect(received).toEqual([
    { type: 'started' },
    { type: 'sim.step', time: 1, outputs: { x: 2 } },
  ])
})

test('normalizes simulation samples and keeps FMI event metadata', () => {
  const sequence = { nextSequence: 0 }

  expect(normalizeSimulationStreamEvent({
    type: 'sim.step', time: 2, outputs: { x: 4 }, eventOccurred: true,
  }, sequence)).toMatchObject({
    kind: 'samples',
    samples: [{ time: 2, sequence: 1, outputs: { x: 4 }, eventOccurred: true }],
  })
  expect(normalizeSimulationStreamEvent({
    type: 'data', time: [3, 4], outputs: { x: [6, 8], y: [true, false] },
  }, sequence).samples).toEqual([
    { time: 3, sequence: 2, outputs: { x: 6, y: true } },
    { time: 4, sequence: 3, outputs: { x: 8, y: false } },
  ])
})

test('filters selected outputs without changing sample values when all outputs are requested', () => {
  expect(selectSimulationOutputs({ x: 1, y: 2 }, ['y'])).toEqual({ y: 2 })
  const outputs = { x: 1, y: 2 }
  expect(selectSimulationOutputs(outputs)).toBe(outputs)
})
