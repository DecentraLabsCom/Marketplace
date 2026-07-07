import {
  notifyIntentRegistrationSignalFromBrowser,
  trackIntentRegistrationReceipt,
} from '../registrationSignalClient'

describe('registrationSignalClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('notifies institutional backend from browser with bearer token', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'accepted' }),
    })

    const result = await notifyIntentRegistrationSignalFromBrowser({
      backendUrl: 'https://institution.example/',
      backendAuthToken: 'token-1',
      requestId: 'req-1',
      event: 'registration_mined',
      txHash: '0xabc',
      blockNumber: 10,
    })

    expect(result.ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://institution.example/intents/req-1/registration',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
        body: JSON.stringify({
          event: 'registration_mined',
          txHash: '0xabc',
          blockNumber: 10,
          reason: null,
        }),
      }),
    )
  })

  test('tracks mined receipt and sends registration_mined', async () => {
    const receiptFetcher = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'mined', blockNumber: 77 }),
    })
    const signalNotifier = jest.fn().mockResolvedValueOnce({ ok: true })

    const result = await trackIntentRegistrationReceipt({
      requestId: 'req-2',
      txHash: '0xdef',
      backendUrl: 'https://institution.example',
      backendAuthToken: 'token-2',
      receiptFetcher,
      signalNotifier,
    })

    expect(result.status).toBe('notified')
    expect(receiptFetcher).toHaveBeenCalledWith(
      '/api/backend/intents/registration/receipt?txHash=0xdef',
      { method: 'GET', credentials: 'include' },
    )
    expect(signalNotifier).toHaveBeenCalledWith({
      backendUrl: 'https://institution.example',
      backendAuthToken: 'token-2',
      requestId: 'req-2',
      event: 'registration_mined',
      txHash: '0xdef',
      blockNumber: 77,
    })
  })

  test('tracks failed receipt and sends registration_failed', async () => {
    const receiptFetcher = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'failed', blockNumber: 78, receiptStatus: 0 }),
    })
    const signalNotifier = jest.fn().mockResolvedValueOnce({ ok: true })

    const result = await trackIntentRegistrationReceipt({
      requestId: 'req-3',
      txHash: '0xghi',
      backendUrl: 'https://institution.example',
      backendAuthToken: 'token-3',
      receiptFetcher,
      signalNotifier,
    })

    expect(result.status).toBe('failed_notified')
    expect(signalNotifier).toHaveBeenCalledWith({
      backendUrl: 'https://institution.example',
      backendAuthToken: 'token-3',
      requestId: 'req-3',
      event: 'registration_failed',
      txHash: '0xghi',
      blockNumber: 78,
      reason: 'registration_tx_failed:0',
    })
  })
})
