/**
 * @jest-environment node
 */

import {
  createFmuUserBinding,
  encodeFmuContexts,
  FMU_CONTEXT_COOKIE,
} from '../fmuSessionStore'
import { requireFmuResourceContext } from '../fmuGatewayContext'
import { extractBearerHeader } from '@/utils/api/gatewayProxy'
import { getOptionalSession } from '@/utils/auth/guards'

jest.mock('@/utils/api/gatewayProxy', () => ({
  GatewayValidationError: class GatewayValidationError extends Error {
    constructor(message, status = 400) {
      super(message)
      this.status = status
    }
  },
  extractBearerHeader: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => ({
  getOptionalSession: jest.fn(),
}))

describe('FMU gateway context authorization', () => {
  const originalSecret = process.env.SESSION_SECRET

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters'
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = originalSecret
  })

  beforeEach(() => {
    jest.clearAllMocks()
    extractBearerHeader.mockReturnValue(null)
  })

  function requestFor(userId) {
    const { encoded } = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xabc',
      gatewayOrigin: 'https://gateway.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: createFmuUserBinding({ id: userId }),
    })

    return new Request('https://marketplace.example.com/api/simulations/run', {
      headers: { Cookie: `${FMU_CONTEXT_COOKIE}=${encoded}` },
    })
  }

  const lookup = {
    labId: '42',
    reservationKey: '0xabc',
    gatewayOrigin: 'https://gateway.example.com',
  }

  test('keeps using the capability when the Marketplace session is absent', async () => {
    getOptionalSession.mockResolvedValue(null)

    await expect(requireFmuResourceContext(requestFor('user-a'), lookup)).resolves.toMatchObject({
      resourceSessionId: 'session_identifier_aaaaaaaa',
    })
  })

  test('requires an active Marketplace session to match the capability binding', async () => {
    getOptionalSession.mockResolvedValue({ id: 'user-b' })

    await expect(requireFmuResourceContext(requestFor('user-a'), lookup)).rejects.toMatchObject({
      status: 401,
    })
  })

  test('allows an active Marketplace session to use its own capability', async () => {
    getOptionalSession.mockResolvedValue({ id: 'user-a' })

    await expect(requireFmuResourceContext(requestFor('user-a'), lookup)).resolves.toMatchObject({
      resourceSessionId: 'session_identifier_aaaaaaaa',
    })
  })
})
