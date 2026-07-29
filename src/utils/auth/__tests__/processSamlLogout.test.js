/** @jest-environment node */

import { revokeFmuContexts } from '../revokeFmuContexts'
import { revokeSamlBoundSessions } from '../revokeSamlBoundSessions'
import {
  completeSamlLogoutRequest,
  getDueSamlLogoutRequests,
  rescheduleSamlLogoutRequest,
} from '../samlLogoutOutbox'
import {
  drainSamlLogoutOutbox,
  processSamlLogoutRequest,
} from '../processSamlLogout'

jest.mock('../revokeFmuContexts', () => ({
  revokeFmuContexts: jest.fn(),
}))
jest.mock('../revokeSamlBoundSessions', () => ({
  revokeSamlBoundSessions: jest.fn(),
}))
jest.mock('../samlLogoutOutbox', () => ({
  completeSamlLogoutRequest: jest.fn(),
  getDueSamlLogoutRequests: jest.fn(),
  rescheduleSamlLogoutRequest: jest.fn(),
}))

describe('SAML logout outbox processing', () => {
  const record = {
    requestId: '_logout-1',
    nameId: 'name-id-1',
    sessionIndex: 'session-index-1',
    attempts: 2,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    revokeSamlBoundSessions.mockResolvedValue([])
    revokeFmuContexts.mockResolvedValue(undefined)
    completeSamlLogoutRequest.mockResolvedValue(true)
    rescheduleSamlLogoutRequest.mockResolvedValue(true)
  })

  test('completes the outbox only after server-side session and browser revocation', async () => {
    const cookieStore = { set: jest.fn() }

    await processSamlLogoutRequest(record, cookieStore)

    expect(revokeSamlBoundSessions).toHaveBeenCalledWith('name-id-1', 'session-index-1')
    expect(revokeFmuContexts).toHaveBeenCalledWith(cookieStore)
    expect(completeSamlLogoutRequest).toHaveBeenCalledWith('_logout-1')
  })

  test('reschedules the accepted request when revocation fails', async () => {
    revokeSamlBoundSessions.mockRejectedValue(new Error('Redis unavailable'))

    await expect(processSamlLogoutRequest(record)).rejects.toThrow('Redis unavailable')

    expect(rescheduleSamlLogoutRequest).toHaveBeenCalledWith({
      requestId: '_logout-1',
      attempts: 2,
    })
    expect(completeSamlLogoutRequest).not.toHaveBeenCalled()
  })

  test('continues draining other accepted logout requests after one failure', async () => {
    getDueSamlLogoutRequests.mockResolvedValue([record])
    revokeSamlBoundSessions.mockRejectedValue(new Error('Redis unavailable'))

    await expect(drainSamlLogoutOutbox()).resolves.toEqual({
      checked: 1,
      completed: 0,
      pending: 1,
    })
  })
})
