/** @jest-environment node */

import { pollIntentStatus } from '../pollIntentStatus'

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
})

describe('pollIntentStatus', () => {
  let fetchMock
  let originalWindow

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock
    originalWindow = global.window
  })

  afterEach(() => {
    global.window = originalWindow
    jest.useRealTimers()
  })

  test.each(['executed', 'failed', 'rejected'])('returns on terminal status %s', async (status) => {
    fetchMock.mockResolvedValue(response({ requestId: 'request-1', status }))
    const onUpdate = jest.fn()

    await expect(pollIntentStatus('request-1', {
      backendUrl: 'https://backend.example/',
      authToken: 'token-1',
      onUpdate,
    })).resolves.toEqual({ requestId: 'request-1', status })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/intents/request-1',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-1',
        },
      }),
    )
    expect(onUpdate).toHaveBeenCalledWith({ requestId: 'request-1', status })
  })

  test('uses the Marketplace proxy in the browser and does not forward the backend token', async () => {
    global.window = {}
    fetchMock.mockResolvedValue(response({ status: 'executed' }))

    await expect(pollIntentStatus('request/browser', {
      authToken: 'must-not-leave-server',
    })).resolves.toEqual({ status: 'executed' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/backend/intents/request/browser?requestId=request%2Fbrowser',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  test('retries after a non-terminal response with exponential backoff', async () => {
    jest.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(response({ status: 'queued' }))
      .mockResolvedValueOnce(response({ status: 'executed' }))

    const pending = pollIntentStatus('request-1', {
      backendUrl: 'https://backend.example',
      initialDelayMs: 10,
      maxDelayMs: 100,
    })

    await jest.runOnlyPendingTimersAsync()
    await expect(pending).resolves.toEqual({ status: 'executed' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('rejects an already-aborted poll without issuing a request', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(pollIntentStatus('request-1', {
      backendUrl: 'https://backend.example',
      signal: controller.signal,
    })).rejects.toThrow('Intent polling aborted')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('requires a backend URL when called outside the browser', async () => {
    await expect(pollIntentStatus('request-1')).rejects.toThrow('Backend URL not configured')
  })
})
