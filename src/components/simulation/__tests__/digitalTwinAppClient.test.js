/** @jest-environment jsdom */
import { createDigitalTwinAppClient } from '@decentralabs/digital-twin-app-protocol/client'
import { connectFmuSession } from '@decentralabs/digital-twin-app-protocol/fmu-client'
jest.mock('@decentralabs/digital-twin-app-protocol/fmu-client', () => ({ connectFmuSession: jest.fn() }))
const connection = { protocolVersion: '1.0', gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions', labId: '42', reservationKey: 'res:1', sessionTicket: 'one-use-ticket', ticketExpiresAt: 4102444800 }
const inputUpdateQuota = {
  maxUpdatesPerWindow: 30,
  windowMs: 10_000,
  maxUpdateBytes: 65_536,
  maxUpdatesPerDay: 100_000,
  maxUpdateBytesPerDay: 67_108_864,
  maxScheduledEventsPerAdvance: 30,
  maxScheduleBytesPerAdvance: 262_144,
}
let clients = []
afterEach(() => { clients.forEach((c) => c.dispose()); clients = []; jest.clearAllMocks() })
function runtime() {
  let time = 0
  const session = { capabilities: {
    advanceSamples: true,
    inputUpdateQuota,
  }, close: jest.fn(), request: jest.fn(async (type, expected, payload) => {
    if (type === 'model.describe') return { defaultStartTime: 0, defaultStopTime: 2, defaultStepSize: 1 }
    if (type === 'sim.getOutputs') return { simTime: 0, values: { x: 0 } }
    if (type === 'sim.advance') { time += 1; return { samples: [{ time, outputs: { x: time } }], simTime: time, finished: time >= 2 } }
    return {}
  }) }
  connectFmuSession.mockResolvedValue(session)
  return session
}
function create(options) { const client = createDigitalTwinAppClient(options); clients.push(client); return client }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
test('executes independently of a host and waits for application processing before the next batch', async () => {
  const session = runtime()
  let finishBatch
  const complete = jest.fn()
  const samples = jest.fn((batch) => batch[0].time === 1 ? new Promise((r) => { finishBatch = r }) : undefined)
  const client = create({ getConnection: async () => connection, onSamples: samples, onResultsComplete: complete })
  const { runId } = await client.run()
  await flush()
  expect(connectFmuSession).toHaveBeenCalledWith(connection, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  expect(session.request.mock.calls.filter(([type]) => type === 'sim.advance')).toHaveLength(1)
  expect(complete).not.toHaveBeenCalled()
  finishBatch()
  await flush()
  expect(complete).toHaveBeenCalledWith({ runId, state: 'completed', sampleCount: 3 }, expect.any(Object))
  expect(session.close).toHaveBeenCalledTimes(1)
})
test('delivers the initial and subsequent samples only to onSamples when both callbacks are supplied', async () => {
  runtime()
  const onSample = jest.fn()
  const onSamples = jest.fn()
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  const client = create({
    getConnection: async () => connection,
    onSample,
    onSamples,
    onResultsComplete: resolveCompletion,
  })

  await client.run()
  await completion

  expect(onSample).not.toHaveBeenCalled()
  expect(onSamples.mock.calls.flatMap(([batch]) => batch.map(({ time }) => time))).toEqual([0, 1, 2])
})
test('delivers the initial and subsequent samples once to onSample when no batch callback is supplied', async () => {
  runtime()
  const onSample = jest.fn()
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  const client = create({ getConnection: async () => connection, onSample, onResultsComplete: resolveCompletion })

  await client.run()
  await completion

  expect(onSample.mock.calls.map(([sample]) => sample.time)).toEqual([0, 1, 2])
})
test('passes requested model variables to validation before deriving initialization parameters', async () => {
  const session = runtime()
  const model = {
    defaultStartTime: 0, defaultStopTime: 1, defaultStepSize: 1,
    modelVariables: [{ name: 'gain', causality: 'parameter', variability: 'fixed', type: 'Real' }],
  }
  session.request.mockImplementation(async (type) => {
    if (type === 'model.describe') return model
    if (type === 'sim.getOutputs') return { simTime: 0, values: { x: 0 } }
    if (type === 'sim.advance') return { samples: [{ time: 1, outputs: { x: 1 } }], simTime: 1, finished: true }
    return {}
  })
  const validateModel = jest.fn(() => true)
  const parametersFromModel = jest.fn(() => ({ gain: 2, derived: 3 }))
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  const client = create({ getConnection: async () => connection, onResultsComplete: resolveCompletion })

  await client.run({ includeModelVariables: true, validateModel, parametersFromModel, parameters: { gain: 4 } })
  await completion

  expect(session.request).toHaveBeenCalledWith('model.describe', 'model.description', { includeVariables: true })
  expect(validateModel).toHaveBeenCalledWith(model)
  expect(parametersFromModel).toHaveBeenCalledWith(model)
  expect(session.request).toHaveBeenCalledWith('sim.initialize', 'sim.state', expect.objectContaining({
    parameters: { gain: 4, derived: 3 },
  }))
})
test('rejects a model mismatch before sending initialization parameters', async () => {
  const session = runtime()
  const client = create({ getConnection: async () => connection })

  await expect(client.run({ includeModelVariables: true, validateModel: () => false }))
    .rejects.toMatchObject({ code: 'FMU_MODEL_MISMATCH' })
  expect(session.request.mock.calls.some(([type]) => type === 'sim.initialize')).toBe(false)
  expect(session.close).toHaveBeenCalledTimes(1)
})
test('keeps selected non-motor outputs consistent from the initial sample through sparse event batches', async () => {
  const session = runtime()
  const selected = ['temperature', 'pressure']
  let authorize
  const grant = new Promise((resolve) => { authorize = resolve })
  const seen = []
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  session.request.mockImplementation(async (type) => {
    if (type === 'model.describe') return { defaultStartTime: 0, defaultStopTime: 4, defaultStepSize: 1 }
    if (type === 'sim.getOutputs') return { simTime: 0, values: { temperature: 22, pressure: 101, extra: 7 } }
    if (type === 'sim.advance') return { simTime: 4, finished: true, samples: [
      { time: 2, sequence: 1, eventOccurred: true, outputs: { temperature: 24, pressure: 100 } },
      { time: 2, sequence: 2, eventHandlingNeeded: true, outputs: { temperature: 25, pressure: 99 } },
      { time: 4, sequence: 3, outputs: { temperature: 26, pressure: 98 } },
    ] }
    return {}
  })
  const client = create({
    getConnection: () => grant,
    onSamples: (samples) => seen.push(...samples),
    onResultsComplete: resolveCompletion,
  })

  const started = client.run({ maxBatchSamples: 3, advanceOptions: { outputVariables: selected, outputSampleEverySteps: 2 } })
  selected.push('later-mutation')
  authorize(connection)
  await started
  expect((await completion).state).toBe('completed')

  expect(session.request).toHaveBeenCalledWith('sim.getOutputs', 'sim.outputs', { variables: ['temperature', 'pressure'] })
  expect(session.request).toHaveBeenCalledWith('sim.advance', 'sim.samples', expect.objectContaining({
    outputVariables: ['temperature', 'pressure'], outputSampleEverySteps: 2,
  }))
  expect(seen.map(({ time, sequence, eventOccurred, eventHandlingNeeded, outputs }) => ({ time, sequence, eventOccurred, eventHandlingNeeded, outputs }))).toEqual([
    { time: 0, sequence: undefined, eventOccurred: undefined, eventHandlingNeeded: undefined, outputs: { temperature: 22, pressure: 101, extra: 7 } },
    { time: 2, sequence: 1, eventOccurred: true, eventHandlingNeeded: undefined, outputs: { temperature: 24, pressure: 100 } },
    { time: 2, sequence: 2, eventOccurred: undefined, eventHandlingNeeded: true, outputs: { temperature: 25, pressure: 99 } },
    { time: 4, sequence: 3, eventOccurred: undefined, eventHandlingNeeded: undefined, outputs: { temperature: 26, pressure: 98 } },
  ])
})
test('rejects an empty selected output list before opening a session', async () => {
  const getConnection = jest.fn(async () => connection)
  const client = create({ getConnection })
  await expect(client.run({ advanceOptions: { outputVariables: [] } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(getConnection).not.toHaveBeenCalled()
})
test('preserves the initial timestamp when its rounding difference is within the simulation tolerance', async () => {
  const session = runtime()
  session.request.mockImplementation(async (type) => {
    if (type === 'model.describe') return { defaultStartTime: 10, defaultStopTime: 10.001, defaultStepSize: 0.001 }
    if (type === 'sim.getOutputs') return { simTime: 10 + 5e-10, values: { temperature: 22 } }
    if (type === 'sim.advance') return { simTime: 10.001, finished: true, samples: [
      { time: 10.001, outputs: { temperature: 23 } },
    ] }
    return {}
  })
  const seen = []
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  const client = create({ getConnection: async () => connection, onSamples: (samples) => seen.push(...samples), onResultsComplete: resolveCompletion })
  await client.run({ advanceOptions: { outputVariables: ['temperature'] } })
  expect((await completion).state).toBe('completed')
  expect(seen[0].time).toBe(10 + 5e-10)
})
test.each([1, 2])('preserves unwrapped non-motor values through decimated batches of up to %i samples', async (maxBatchSamples) => {
  const session = runtime()
  const returned = [
    { time: 2, sequence: 1, outputs: { 'telescope.azimuth': 11 * Math.PI, 'fluid.pressure': 100 } },
    { time: 4, sequence: 2, outputs: { 'telescope.azimuth': -9 * Math.PI, 'fluid.pressure': 98 } },
  ]
  session.request.mockImplementation(async (type, _, payload) => {
    if (type === 'model.describe') return { defaultStartTime: 0, defaultStopTime: 4, defaultStepSize: 1 }
    if (type === 'sim.getOutputs') return { simTime: 0, values: { 'telescope.azimuth': -7, 'fluid.pressure': 101 } }
    if (type === 'sim.advance') {
      const samples = []
      while (returned.length && returned[0].time <= payload.targetTime && samples.length < payload.maxSamples) samples.push(returned.shift())
      return { simTime: samples.at(-1).time, finished: returned.length === 0, samples }
    }
    return {}
  })
  const seen = []
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  const client = create({ getConnection: async () => connection, onSamples: (samples) => seen.push(...samples), onResultsComplete: resolveCompletion })
  await client.run({ maxBatchSamples, advanceOptions: { outputVariables: ['telescope.azimuth', 'fluid.pressure'], outputSampleEverySteps: 2 } })
  expect((await completion).state).toBe('completed')
  expect(seen.map(({ time, outputs }) => [time, outputs['telescope.azimuth'], outputs['fluid.pressure']])).toEqual([
    [0, -7, 101], [2, 11 * Math.PI, 100], [4, -9 * Math.PI, 98],
  ])
})
test.each([
  { simTime: 0, values: { temperature: 22 } },
  { simTime: 0.5, values: { temperature: 22, pressure: 101 } },
])('rejects incomplete or mis-timed selected initial outputs', async (initial) => {
  const session = runtime()
  session.request.mockImplementation(async (type) => {
    if (type === 'model.describe') return { defaultStartTime: 0, defaultStopTime: 2, defaultStepSize: 1 }
    if (type === 'sim.getOutputs') return initial
    return {}
  })
  const onSamples = jest.fn()
  const client = create({ getConnection: async () => connection, onSamples })
  await expect(client.run({ advanceOptions: { outputVariables: ['temperature', 'pressure'] } }))
    .rejects.toMatchObject({ code: 'INVALID_FMU_RESPONSE' })
  expect(onSamples).not.toHaveBeenCalled()
  expect(session.close).toHaveBeenCalledTimes(1)
})
test('stops without delivering a batch that omits a selected output', async () => {
  const session = runtime()
  session.request.mockImplementation(async (type) => {
    if (type === 'model.describe') return { defaultStartTime: 0, defaultStopTime: 1, defaultStepSize: 1 }
    if (type === 'sim.getOutputs') return { simTime: 0, values: { temperature: 22, pressure: 101 } }
    if (type === 'sim.advance') return { simTime: 1, finished: true, samples: [
      { time: 1, outputs: { temperature: 23 } },
    ] }
    return {}
  })
  const onSamples = jest.fn()
  const onError = jest.fn()
  let resolveCompletion
  const completion = new Promise((resolve) => { resolveCompletion = resolve })
  const client = create({ getConnection: async () => connection, onSamples, onError, onResultsComplete: resolveCompletion })
  await client.run({ advanceOptions: { outputVariables: ['temperature', 'pressure'] } })
  expect((await completion).state).toBe('error')
  expect(onSamples).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_FMU_RESPONSE' }))
  expect(session.close).toHaveBeenCalledTimes(1)
})
test('cancel aborts callbacks and closes the direct FMU session', async () => {
  const session = runtime()
  let finishBatch
  let context
  const complete = jest.fn()
  const client = create({ getConnection: async () => connection, onSamples: async (batch, _, ctx) => {
    if (batch[0].time === 1) { context = ctx; await new Promise((r) => { finishBatch = r }) }
  }, onResultsComplete: complete })
  const { runId } = await client.run()
  await flush()
  client.cancel(runId)
  expect(context.signal.aborted).toBe(true)
  finishBatch()
  await flush()
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ state: 'cancelled' }), expect.any(Object))
  expect(session.close).toHaveBeenCalledTimes(1)
})
test('uses the parent only to obtain a connection capability', async () => {
  runtime()
  const parent = Object.getOwnPropertyDescriptor(window, 'parent')
  const host = { postMessage: jest.fn() }
  Object.defineProperty(window, 'parent', { configurable: true, value: host })
  try {
    const send = (message) => window.dispatchEvent(new MessageEvent('message', { source: host, data: { version: 2, ...message } }))
    const client = create({ onSamples: jest.fn() })
    client.reportReady()
    send({ type: 'decentralabs:digital-twin-host-ready' })
    const run = client.run({ parameters: { x: 1 }, options: { stopTime: 2 } })
    const request = host.postMessage.mock.calls.map(([m]) => m).find((m) => m.type === 'decentralabs:fmu-connection-request')
    expect(request.parameters).toBeUndefined()
    send({ type: 'decentralabs:fmu-connection-ready', requestId: request.requestId, connection })
    await run
    await flush()
    const types = host.postMessage.mock.calls.map(([m]) => m.type)
    expect(types).toContain('decentralabs:execution-state')
  } finally { Object.defineProperty(window, 'parent', parent) }
})

test('keeps the run active until asynchronous result finalization finishes', async () => {
  runtime()
  let complete
  const client = create({ getConnection: async () => connection, onResultsComplete: () => new Promise((resolve) => { complete = resolve }) })
  const first = await client.run()
  await flush()
  expect(client.activeRunId).toBe(first.runId)
  await expect(client.run()).rejects.toMatchObject({ code: 'RUN_UNAVAILABLE' })
  complete()
  await flush()
  expect(client.activeRunId).toBeNull()
})

test('retries a temporarily rate-limited input update using the session quota capability', async () => {
  const session = runtime()
  let attempts = 0
  session.request.mockImplementation(async (type, expected, payload) => {
    if (type === 'model.describe') return { defaultStartTime: 0, defaultStopTime: 1, defaultStepSize: 1 }
    if (type === 'sim.getOutputs') return { simTime: 0, values: { x: 0 } }
    if (type === 'sim.setInputs') {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('Input updates are rate limited')
        error.code = 'INPUT_UPDATE_RATE_LIMIT'
        error.retryAfterMs = 1
        throw error
      }
      return { type: expected, values: payload.values }
    }
    if (type === 'sim.advance') return { samples: [{ time: 1, outputs: { x: 1 } }], simTime: 1, finished: true }
    return {}
  })
  const client = create({ getConnection: async () => connection })

  await client.run({ inputController: () => ({ x: 4 }) })
  await flush()

  expect(session.request.mock.calls.filter(([type]) => type === 'sim.setInputs')).toHaveLength(2)
  expect(session.request.mock.calls.filter(([type]) => type === 'sim.advance')).toHaveLength(1)
  expect(client.activeRunId).toBeNull()
})
