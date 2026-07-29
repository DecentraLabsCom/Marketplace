/**
 * @jest-environment node
 */

import { gatewayFetch, buildGatewayTargetUrl } from '@/utils/api/gatewayProxy'
import {
  ackFmuRevocation,
  clearFmuCapabilitiesForSession,
  enqueueFmuRevocation,
  getDueFmuRevocations,
  getFmuCapabilitiesForSession,
  removeFmuCapabilityForSession,
  rescheduleFmuRevocation,
} from '@/utils/auth/samlSessionStateStore'
import {
  drainFmuRevocationOutbox,
  revokeFmuContextsForSessions,
} from '../revokeFmuContexts'

jest.mock('@/utils/api/gatewayProxy', () => ({
  gatewayFetch: jest.fn(),
  buildGatewayTargetUrl: jest.fn((origin, path) => `${origin}${path}`),
}))

jest.mock('@/utils/auth/samlSessionStateStore', () => ({
  ackFmuRevocation: jest.fn(),
  clearFmuCapabilitiesForSession: jest.fn(),
  enqueueFmuRevocation: jest.fn(),
  getDueFmuRevocations: jest.fn(),
  getFmuCapabilitiesForSession: jest.fn(),
  removeFmuCapabilityForSession: jest.fn(),
  rescheduleFmuRevocation: jest.fn(),
}))

describe('durable FMU revocation', () => {
  const sessionId = 's'.repeat(43)
  const context = {
    gatewayOrigin: 'https://gateway.example.com',
    resourceSessionId: 'resource_session_aaaaaaaa',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    enqueueFmuRevocation.mockResolvedValue(true)
    removeFmuCapabilityForSession.mockResolvedValue(undefined)
    ackFmuRevocation.mockResolvedValue(undefined)
    rescheduleFmuRevocation.mockResolvedValue(true)
    clearFmuCapabilitiesForSession.mockResolvedValue(undefined)
  })

  test('keeps the durable capability and schedules an outbox retry when Gateway revocation fails', async () => {
    getFmuCapabilitiesForSession
      .mockResolvedValueOnce([context])
      .mockResolvedValueOnce([context])
    gatewayFetch.mockRejectedValue(new Error('gateway unavailable'))

    await revokeFmuContextsForSessions([sessionId])

    expect(enqueueFmuRevocation).toHaveBeenCalledWith({ sessionId, context })
    expect(rescheduleFmuRevocation).toHaveBeenCalledWith({
      sessionId,
      context,
      attempts: 0,
    })
    expect(removeFmuCapabilityForSession).not.toHaveBeenCalled()
    expect(ackFmuRevocation).not.toHaveBeenCalled()
    expect(clearFmuCapabilitiesForSession).not.toHaveBeenCalled()
  })

  test('removes the durable capability only after an exact 204 confirmation', async () => {
    getFmuCapabilitiesForSession
      .mockResolvedValueOnce([context])
      .mockResolvedValueOnce([])
    gatewayFetch.mockResolvedValue({ ok: true, status: 204 })

    await revokeFmuContextsForSessions([sessionId])

    expect(gatewayFetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/fmu/revoke',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(removeFmuCapabilityForSession).toHaveBeenCalledWith(sessionId, context)
    expect(ackFmuRevocation).toHaveBeenCalledWith({ sessionId, context })
    expect(clearFmuCapabilitiesForSession).toHaveBeenCalledWith(sessionId)
    expect(rescheduleFmuRevocation).not.toHaveBeenCalled()
  })

  test('keeps the capability pending for a non-204 response', async () => {
    getFmuCapabilitiesForSession
      .mockResolvedValueOnce([context])
      .mockResolvedValueOnce([context])
    gatewayFetch.mockResolvedValue({ ok: true, status: 200 })

    await revokeFmuContextsForSessions([sessionId])

    expect(removeFmuCapabilityForSession).not.toHaveBeenCalled()
    expect(ackFmuRevocation).not.toHaveBeenCalled()
    expect(rescheduleFmuRevocation).toHaveBeenCalled()
  })

  test('removes an expired capability without contacting the Gateway', async () => {
    const expiredContext = { ...context, expiresAt: Math.floor(Date.now() / 1000) - 1 }
    getFmuCapabilitiesForSession
      .mockResolvedValueOnce([expiredContext])
      .mockResolvedValueOnce([])

    await revokeFmuContextsForSessions([sessionId])

    expect(gatewayFetch).not.toHaveBeenCalled()
    expect(removeFmuCapabilityForSession).toHaveBeenCalledWith(sessionId, expiredContext)
    expect(ackFmuRevocation).toHaveBeenCalledWith({ sessionId, context: expiredContext })
  })

  test('drains a pending entry after the Gateway recovers', async () => {
    getDueFmuRevocations.mockResolvedValue([{ sessionId, context, attempts: 1 }])
    gatewayFetch.mockResolvedValue({ ok: true, status: 204 })

    await expect(drainFmuRevocationOutbox()).resolves.toEqual({
      checked: 1,
      confirmed: 1,
      pending: 0,
    })
    expect(removeFmuCapabilityForSession).toHaveBeenCalledWith(sessionId, context)
    expect(ackFmuRevocation).toHaveBeenCalledWith({ sessionId, context })
  })
})
