/** @jest-environment node */

import { createHash } from 'node:crypto'
import { POST as start } from '../route'
import { POST as decide } from '../authorize/route'
import { POST as redeem } from '../token/route'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { clearRateLimitStoresForTests } from '@/utils/api/rateLimit'
import { requireAuth, getOptionalSession, UnauthorizedError } from '@/utils/auth/guards'
import { createFmuUserBinding, encodeFmuContexts, FMU_CONTEXT_COOKIE } from '@/utils/auth/fmuSessionStore'

jest.mock('@/app/api/contract/utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/api/gatewayProxy', () => ({
  ...jest.requireActual('@/utils/api/gatewayProxy'),
  gatewayFetch: jest.fn(),
  resolveLabAccessGateway: jest.fn(),
}))
jest.mock('@/utils/auth/guards', () => ({
  ...jest.requireActual('@/utils/auth/guards'),
  requireAuth: jest.fn(),
  getOptionalSession: jest.fn(),
}))
jest.mock('@/utils/redis/restClient', () => ({
  ...jest.requireActual('@/utils/redis/restClient'),
  hasRedisConfig: () => false,
}))

const origin = 'https://marketplace.example'
const gatewayOrigin = 'https://provider.example'
const capability = 'gateway_fmu_session'
const verifier = 'v'.repeat(43)
const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
const resource = { labId: '42', reservationKey: 'res:1' }
const session = { id: 'user-1' }
const resourceSessionId = 'fixture-fmu-resource-session'
const getLab = jest.fn()

function request(suffix, body, headers = {}) {
  return new Request(`${origin}/api/ic2is2/device${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function reservationCookie(overrides = {}) {
  const { encoded } = encodeFmuContexts([], {
    ...resource,
    gatewayOrigin,
    resourceSessionId,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    userBinding: createFmuUserBinding(session),
    ...overrides,
  })
  return { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` }
}

async function startExperiment() {
  const response = await start(request('', { ...resource, capability, codeChallenge }))
  expect(response.status).toBe(200)
  return response.json()
}

beforeEach(() => {
  jest.resetAllMocks()
  clearRateLimitStoresForTests()
  jest.replaceProperty(process, 'env', { ...process.env, MARKETPLACE_BASE_URL: origin })
  getContractInstance.mockResolvedValue({ getLab })
  getLab.mockResolvedValue([42n, { resourceType: 1n }])
  resolveLabAccessGateway.mockResolvedValue(gatewayOrigin)
  requireAuth.mockResolvedValue(session)
  getOptionalSession.mockResolvedValue(session)
})

afterEach(() => jest.restoreAllMocks())

test.each([undefined, 'physical_session', 'constructor'])('requires a registered capability: %s', async (requested) => {
  const response = await start(request('', { ...resource, capability: requested, codeChallenge }))
  expect(response.status).toBe(400)
  expect(getContractInstance).not.toHaveBeenCalled()
})

test('uses the stored capability for authenticated consent and issues one matching grant', async () => {
  const { deviceCode, userCode } = await startExperiment()
  const ticket = {
    ...resource,
    protocolVersion: '1.0',
    gatewayWsUrl: 'wss://provider.example/fmu/api/v1/fmu/sessions',
    sessionTicket: 'fixture-ticket',
    ticketExpiresAt: Math.floor(Date.now() / 1000) + 120,
  }
  gatewayFetch.mockResolvedValue(Response.json(ticket))
  const preview = await decide(request('/authorize', { userCode, action: 'preview' }, reservationCookie()))
  expect(preview.status).toBe(200)
  expect(await preview.json()).toMatchObject({ ...resource, capability, label: 'Reserved FMU experiment' })
  expect(gatewayFetch).not.toHaveBeenCalled()

  const approval = await decide(request('/authorize', { userCode, action: 'approve' }, reservationCookie()))
  expect(await approval.json()).toEqual({ approved: true })
  expect(getLab).toHaveBeenCalledWith(resource.labId)
  expect(gatewayFetch).toHaveBeenCalledWith(
    expect.stringContaining('/fmu/api/v1/fmu/connection/42'),
    expect.objectContaining({ headers: { Cookie: `FMU_SESSION=${resourceSessionId}` } }),
  )

  const poll = () => redeem(request('/token', { deviceCode, codeVerifier: verifier }))
  const results = await Promise.all([poll(), poll()])
  expect(results.map(({ status }) => status).sort()).toEqual([200, 400])
  const grantResponse = results.find(({ status }) => status === 200)
  expect(grantResponse.headers.get('cache-control')).toBe('no-store')
  expect(await grantResponse.json()).toMatchObject({ ...ticket, grantType: capability })
})

test('rejects a physical resource at approval even with an FMU context cookie', async () => {
  const { userCode } = await startExperiment()
  getLab.mockResolvedValue([42n, { resourceType: 0n }])
  const response = await decide(request('/authorize', { userCode, action: 'approve' }, reservationCookie()))
  expect(response.status).toBe(403)
  expect(gatewayFetch).not.toHaveBeenCalled()
})

test('requires a matching reservation for approval and permits signed-in denial without it', async () => {
  const { deviceCode, userCode } = await startExperiment()
  const approval = await decide(request('/authorize', { userCode, action: 'approve' }, reservationCookie({
    reservationKey: 'res:other',
  })))
  expect(approval.status).toBe(401)
  getLab.mockClear()
  resolveLabAccessGateway.mockClear()

  requireAuth.mockRejectedValueOnce(new UnauthorizedError())
  const deny = () => decide(request('/authorize', { userCode, action: 'deny' }))
  expect((await deny()).status).toBe(401)
  expect(await (await deny()).json()).toEqual({ denied: true })
  expect(getLab).not.toHaveBeenCalled()
  expect(resolveLabAccessGateway).not.toHaveBeenCalled()
  expect(gatewayFetch).not.toHaveBeenCalled()

  const result = await redeem(request('/token', { deviceCode, codeVerifier: verifier }))
  expect(result.status).toBe(400)
  expect(await result.json()).toEqual({ error: 'access_denied' })
})
