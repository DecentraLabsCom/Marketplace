/** @jest-environment node */
import { POST } from '../route'
import { gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { clearRateLimitStoresForTests } from '@/utils/api/rateLimit'
jest.mock('@/utils/api/gatewayProxy', () => ({ ...jest.requireActual('@/utils/api/gatewayProxy'), gatewayFetch: jest.fn(), resolveLabAccessGateway: jest.fn() }))
jest.mock('@/utils/auth/fmuGatewayContext', () => ({ requireFmuResourceContext: jest.fn(), resolveFmuGatewayHeaders: jest.fn() }))
const grant = { protocolVersion: '1.0', gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions', labId: '42', reservationKey: 'res:1', sessionTicket: 'one-use-ticket', ticketExpiresAt: 4102444800 }
const request = (origin) => new Request('https://marketplace.example/api/simulations/connection', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ labId: '42', reservationKey: 'res:1' }) })
beforeEach(() => {
  jest.clearAllMocks()
  clearRateLimitStoresForTests()
  resolveLabAccessGateway.mockResolvedValue('https://provider.example')
  requireFmuResourceContext.mockResolvedValue({ resourceSessionId: 'private-context', userBinding: 'user-1' })
  resolveFmuGatewayHeaders.mockReturnValue({ Cookie: 'FMU_SESSION=private-context' })
  gatewayFetch.mockResolvedValue(new Response(JSON.stringify(grant)))
})
test('returns only the one-use grant and forbids response caching', async () => {
  const response = await POST(request('https://marketplace.example'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(grant)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(requireFmuResourceContext).toHaveBeenCalledWith(expect.anything(), { labId: '42', reservationKey: 'res:1', gatewayOrigin: 'https://provider.example' })
})
test('cross-site callers cannot mint tickets', async () => {
  expect((await POST(request('https://attacker.example'))).status).toBe(403)
  expect(gatewayFetch).not.toHaveBeenCalled()
})
test.each([
  { gatewayWsUrl: 'wss://attacker.example/fmu/api/v1/fmu/sessions' },
  { gatewayWsUrl: 'wss://provider.example/other-api' },
  { labId: '43' }, { reservationKey: 'res:other' }, { ticketExpiresAt: 1 },
  { gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions?ticket=secret' },
])('rejects grants outside the authorized endpoint or reservation: %j', async (overrides) => {
  gatewayFetch.mockResolvedValue(new Response(JSON.stringify({ ...grant, ...overrides })))
  expect((await POST(request())).status).toBe(502)
})
