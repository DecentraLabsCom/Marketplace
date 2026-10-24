/** @jest-environment node */
import { connectFmuSession } from '@decentralabs/digital-twin-app-protocol/fmu-client'

const grant = { protocolVersion: '1.0', gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions', labId: '42', reservationKey: 'res:1', sessionTicket: 'one-use-ticket', ticketExpiresAt: 4102444800 }
let original
class Socket extends EventTarget {
  static OPEN = 1
  static instances = []
  constructor(url) { super(); this.url = url; this.sent = []; this.readyState = 1; Socket.instances.push(this); queueMicrotask(() => this.dispatchEvent(new Event('open'))) }
  send(raw) {
    const message = JSON.parse(raw)
    this.sent.push(message)
    if (message.type === 'session.create') this.reply({ type: 'session.created', sessionId: 'session:1', requestId: message.requestId, capabilities: { advanceSamples: true } })
  }
  reply(response) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(response) })) }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')) }
}
beforeEach(() => { original = global.WebSocket; global.WebSocket = Socket; Socket.instances = [] })
afterEach(() => { global.WebSocket = original })
test('uses the native session.create ticket exchange without a token in the URL', async () => {
  const session = await connectFmuSession(grant)
  const socket = Socket.instances[0]
  expect(socket.url).toBe(grant.gatewayWsUrl)
  expect(socket.sent[0]).toMatchObject({ type: 'session.create', labId: grant.labId, reservationKey: grant.reservationKey, sessionTicket: grant.sessionTicket })
  const result = session.request('model.describe', 'model.description')
  const request = socket.sent.at(-1)
  expect(request.sessionTicket).toBeUndefined()
  socket.reply({ type: 'model.description', requestId: request.requestId, sessionId: 'session:1', modelName: 'example' })
  await expect(result).resolves.toMatchObject({ modelName: 'example' })
  session.close()
  expect(socket.sent.at(-1).type).toBe('session.terminate')
})
test('aborting closes the session and rejects outstanding operations', async () => {
  const controller = new AbortController()
  const session = await connectFmuSession(grant, { signal: controller.signal })
  const request = session.request('sim.advance', 'sim.samples')
  controller.abort()
  await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  expect(Socket.instances[0].readyState).toBe(3)
})
test('rejects responses for another session', async () => {
  const session = await connectFmuSession(grant)
  const result = session.request('sim.advance', 'sim.samples')
  const socket = Socket.instances[0]
  socket.reply({ type: 'sim.samples', requestId: socket.sent.at(-1).requestId, sessionId: 'other-session', samples: [] })
  await expect(result).rejects.toThrow('another session')
})
test('an expired grant cannot open a socket', async () => {
  await expect(connectFmuSession({ ...grant, ticketExpiresAt: 1 })).rejects.toMatchObject({ code: 'INVALID_CONNECTION_GRANT' })
  expect(Socket.instances).toHaveLength(0)
})
