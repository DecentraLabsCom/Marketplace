/** @jest-environment jsdom */
import { createDigitalTwinAppClient } from '@decentralabs/digital-twin-app-protocol/client'
import { connectFmuSession } from '@decentralabs/digital-twin-app-protocol/fmu-client'
jest.mock('@decentralabs/digital-twin-app-protocol/fmu-client', () => ({ connectFmuSession: jest.fn() }))
const connection = { protocolVersion: '1.0', gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions', labId: '42', reservationKey: 'res:1', sessionTicket: 'one-use-ticket', ticketExpiresAt: 4102444800 }
let clients = []
afterEach(() => { clients.forEach((c) => c.dispose()); clients = []; jest.clearAllMocks() })
function runtime() {
  let time = 0
  const session = { capabilities: { advanceSamples: true }, close: jest.fn(), request: jest.fn(async (type, expected, payload) => {
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
