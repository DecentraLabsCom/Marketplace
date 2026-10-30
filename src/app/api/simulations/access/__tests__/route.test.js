/** @jest-environment node */
import { POST } from '../route'
import { gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { clearRateLimitStoresForTests } from '@/utils/api/rateLimit'

jest.mock('@/utils/api/gatewayProxy', () => ({ ...jest.requireActual('@/utils/api/gatewayProxy'), gatewayFetch: jest.fn(), resolveLabAccessGateway: jest.fn() }))
jest.mock('@/utils/auth/fmuGatewayContext', () => ({ requireFmuResourceContext: jest.fn(), resolveFmuGatewayHeaders: jest.fn() }))

const policy = {
  policySource: 'aas-provider',
  policyVersion: '1',
  variables: {
    command: { read: false, writeAt: ['initialization', 'runtime'] },
    temperature: { read: true, writeAt: [] },
  },
  modelVariables: [
    { name: 'command', causality: 'input', type: 'Real', start: 0 },
    { name: 'temperature', causality: 'output', type: 'Real', start: 20 },
    { name: 'secret', causality: 'output', type: 'Real' },
  ],
}
const request = (body = { labId: '42', reservationKey: 'res:1' }, headers = {}) => new Request('https://marketplace.example/api/simulations/access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://marketplace.example', ...headers },
  body: JSON.stringify(body),
})

beforeEach(() => {
  jest.clearAllMocks()
  clearRateLimitStoresForTests()
  resolveLabAccessGateway.mockResolvedValue('https://provider.example')
  requireFmuResourceContext.mockResolvedValue({ resourceSessionId: 'private-context', userBinding: 'user-1' })
  resolveFmuGatewayHeaders.mockReturnValue({ Cookie: 'FMU_SESSION=private-context' })
  gatewayFetch.mockResolvedValue(new Response(JSON.stringify(policy)))
})

test('returns the reservation-bound variable policy without caching it', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    ...policy,
    fmiLsExperiments: [],
    modelVariables: [
      { name: 'command', causality: 'input', type: 'Real' },
      { name: 'temperature', causality: 'output', type: 'Real', start: 20 },
    ],
  })
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(requireFmuResourceContext).toHaveBeenCalledWith(expect.anything(), {
    labId: '42', reservationKey: 'res:1', gatewayOrigin: 'https://provider.example',
  })
  expect(gatewayFetch).toHaveBeenCalledWith('https://provider.example/fmu/api/v1/simulations/access', expect.objectContaining({ cache: 'no-store' }))
})

test('rejects cross-site and malformed requests before contacting the Gateway', async () => {
  expect((await POST(request(undefined, { Origin: 'https://attacker.example' }))).status).toBe(403)
  expect((await POST(request({ labId: '42', reservationKey: '' }))).status).toBe(400)
  expect(gatewayFetch).not.toHaveBeenCalled()
})

test.each([
  null,
  {},
  { variables: [] },
])('rejects an invalid policy response: %j', async (invalid) => {
  gatewayFetch.mockResolvedValue(new Response(JSON.stringify(invalid)))
  expect((await POST(request())).status).toBe(502)
})
