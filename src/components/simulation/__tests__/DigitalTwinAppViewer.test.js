import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DigitalTwinAppViewer from '../digital-twin/DigitalTwinAppViewer'
const connection = { protocolVersion: '1.0', gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions', labId: '42', reservationKey: 'res:1', sessionTicket: 'one-use-ticket', ticketExpiresAt: 4102444800 }
function mount(onConnect, extra = {}, { announceReady = true } = {}) {
  render(<DigitalTwinAppViewer title="Provider app" appUrl="/apps/index.html" onConnect={onConnect} {...extra} />)
  const iframe = screen.getByTitle('Provider app digital twin application')
  const post = jest.fn()
  Object.defineProperty(iframe.contentWindow, 'postMessage', { configurable: true, value: post })
  const send = (message, source = iframe.contentWindow) => act(() => window.dispatchEvent(new MessageEvent('message', { source, data: { version: 2, ...message } })))
  fireEvent.load(iframe)
  if (announceReady) send({ type: 'decentralabs:digital-twin-ready', capabilities: ['execution-control'] })
  return { iframe, post, send }
}
test('delivers only the scoped connection grant to the ready iframe', async () => {
  const onConnect = jest.fn().mockResolvedValue(connection)
  const { post, send } = mount(onConnect)
  send({ type: 'decentralabs:fmu-connection-request', requestId: 'grant:1', options: { stopTime: 20 } })
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'decentralabs:fmu-connection-ready', version: 2, connection }), '*'))
  expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ options: { stopTime: 20 }, signal: expect.any(AbortSignal) }))
})

test('sends authorized FMI dependencies to SDK apps through the shared host extension', () => {
  const { post } = mount(jest.fn(), {
    modelVariables: [
      { name: 'u', causality: 'input', type: 'Float64', unit: 'm/s' },
      { name: 'y', causality: 'output', type: 'Float64' },
    ],
    fmiModelStructure: { outputs: [{ name: 'y', dependencyNames: ['u'] }] },
  })

  expect(post).toHaveBeenCalledWith(expect.objectContaining({
    type: 'decentralabs:digital-twin-host-ready',
    extensions: { fmiModelMetadata: {
      modelVariables: [
        { name: 'u', causality: 'input', type: 'Float64', unit: 'm/s' },
        { name: 'y', causality: 'output', type: 'Float64' },
      ],
      modelStructure: { outputs: [{ name: 'y', dependencyNames: ['u'] }] },
    } },
  }), '*')
})

test('authorizes a batch stream without issuing a WebSocket ticket and relays its samples', async () => {
  const onConnect = jest.fn()
  const encoder = new TextEncoder()
  const lines = [
    { type: 'sim.step', sequence: 1, time: 1, outputs: { x: 2 } },
    { type: 'sim.done', time: 1, finishReason: 'target reached' },
  ].map((event) => `${JSON.stringify(event)}\n`)
  const chunks = lines.map((line) => encoder.encode(line))
  const onBatchSimulation = jest.fn().mockResolvedValue({
    ok: true,
    body: { getReader: () => ({ read: jest.fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] })
      .mockResolvedValueOnce({ done: true }) }) },
  })
  const { post, send } = mount(onConnect, {
    onBatchSimulation, startTime: 0, stepSize: 1,
    modelVariables: [{ name: 'gain', type: 'Real', start: 2 }],
  })
  send({
    type: 'decentralabs:fmu-connection-request', requestId: 'grant:batch',
    transport: 'batch-http', executionPace: 'fastest', options: { stopTime: 1 },
  })
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
    type: 'decentralabs:fmu-connection-ready', transport: 'batch-http', executionPace: 'fastest',
  }), '*'))
  expect(onConnect).not.toHaveBeenCalled()

  send({
    type: 'decentralabs:batch-execution-request', requestId: 'batch:1', runId: 'run:1',
    body: { parameters: { gain: 2, offset: 3 }, options: { startTime: 0, stopTime: 1, stepSize: 1, tolerance: 1e-7 }, inputSchedule: [] },
    batchOptions: { maxSamples: 4, outputVariables: ['x'], outputSampleEverySteps: 3 },
  })
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
    type: 'decentralabs:batch-execution-event',
    eventId: 1,
    event: { kind: 'samples', samples: [{ time: 1, sequence: 1, outputs: { x: 2 } }] },
  }), '*'))
  expect(onBatchSimulation).toHaveBeenCalledWith(expect.objectContaining({
    body: {
      parameters: { offset: 3 },
      options: { startTime: 0, stopTime: 1, stepSize: 1, tolerance: 1e-7, outputVariables: ['x'], outputSampleEverySteps: 3 },
      inputSchedule: [],
    },
    signal: expect.any(AbortSignal),
  }))
  send({ type: 'decentralabs:batch-execution-ack', requestId: 'batch:1', eventId: 1 })
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
    type: 'decentralabs:batch-execution-event', eventId: 2,
    event: { kind: 'completed', time: 1, finishReason: 'target reached' },
  }), '*'))
  send({ type: 'decentralabs:batch-execution-ack', requestId: 'batch:1', eventId: 2 })
  await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({
    type: 'decentralabs:batch-execution-end', requestId: 'batch:1',
  }), '*'))
})
test('accepts current requests only from the iframe using the current protocol version', () => {
  const onConnect = jest.fn()
  const { send } = mount(onConnect)
  send({ type: 'decentralabs:fmu-connection-request', requestId: 'grant:1' }, window)
  send({ type: 'decentralabs:fmu-connection-request', requestId: 'grant:2', version: 3 })
  expect(onConnect).not.toHaveBeenCalled()
})
test('reports authorization failure without disclosing provider credentials', async () => {
  const { post, send } = mount(jest.fn().mockRejectedValue(new Error('private-token')))
  send({ type: 'decentralabs:fmu-connection-request', requestId: 'grant:1' })
  await waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'decentralabs:fmu-connection-error', version: 2, requestId: 'grant:1', code: 'CONNECTION_AUTHORIZATION_FAILED' }, '*'))
  expect(JSON.stringify(post.mock.calls)).not.toContain('private-token')
})
test('cancellation requests travel to the app that owns the WS session', async () => {
  const { post, send } = mount(jest.fn())
  send({ type: 'decentralabs:execution-state', runId: 'run:1', state: 'running', options: { startTime: 0, stopTime: 20 } })
  fireEvent.click(screen.getByRole('button', { name: 'Open digital twin controls' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel simulation' }))
  expect(post).toHaveBeenCalledWith({ type: 'decentralabs:execution-cancel', version: 2, runId: 'run:1' }, '*')
})

test('a late React startup can initiate the host handshake after iframe load', () => {
  const { post, send } = mount(jest.fn(), {}, { announceReady: false })
  post.mockClear()
  send({ type: 'decentralabs:digital-twin-connect' })
  expect(post).toHaveBeenCalledWith({ type: 'decentralabs:digital-twin-host-ready', version: 2 }, '*')
})

test('a navigation cannot receive an outstanding grant issued to the previous document', async () => {
  let complete
  const { post, send, iframe } = mount(() => new Promise((resolve) => { complete = resolve }))
  send({ type: 'decentralabs:fmu-connection-request', requestId: 'grant:old' })
  fireEvent.load(iframe)
  await act(async () => complete(connection))
  expect(post.mock.calls.some(([message]) => message.type === 'decentralabs:fmu-connection-ready')).toBe(false)
})
