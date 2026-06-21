import pollIntentAuthorizationStatus from '../pollIntentAuthorizationStatus'

describe('pollIntentAuthorizationStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    delete global.fetch
  })

  test('uses a 500ms default delay before the first retry', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'PENDING' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'SUCCESS', requestId: 'req-1' }),
      })

    const resultPromise = pollIntentAuthorizationStatus('session-1', {
      backendUrl: 'https://institution.example',
      authToken: 'token-1',
    })

    await Promise.resolve()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(499)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)
    await expect(resultPromise).resolves.toMatchObject({
      status: 'SUCCESS',
      requestId: 'req-1',
    })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
