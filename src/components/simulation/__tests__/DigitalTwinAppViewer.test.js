import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DigitalTwinAppViewer from '../DigitalTwinAppViewer'
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
