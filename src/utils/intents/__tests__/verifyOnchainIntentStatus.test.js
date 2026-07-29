import {
  fetchOnchainIntentStatus,
  isOnchainIntentExecuted,
  verifyInstitutionReportedExecution,
} from '../verifyOnchainIntentStatus'
import { INTENT_STATE } from '../intentState'

describe('verifyOnchainIntentStatus', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    delete global.fetch
    jest.clearAllMocks()
  })

  test('recognizes executed intent state', () => {
    expect(isOnchainIntentExecuted({ state: INTENT_STATE.EXECUTED })).toBe(true)
    expect(isOnchainIntentExecuted({ state: INTENT_STATE.PENDING })).toBe(false)
  })

  test('fetches on-chain intent status from marketplace proxy', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ requestId: '0x' + '1'.repeat(64), state: 2 }),
    })

    const status = await fetchOnchainIntentStatus('0x' + '1'.repeat(64))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/backend/intents/0x1111111111111111111111111111111111111111111111111111111111111111/onchain',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
    expect(status.state).toBe(2)
  })

  test('rejects institution-reported execution when chain state is not executed', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: INTENT_STATE.PENDING, stateName: 'PENDING' }),
    })

    await expect(
      verifyInstitutionReportedExecution('0x' + '2'.repeat(64), { attempts: 1 }),
    ).rejects.toThrow('expected EXECUTED')
  })

  test('retries transient on-chain intent states before accepting execution', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: INTENT_STATE.PENDING, stateName: 'PENDING' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: INTENT_STATE.EXECUTED, stateName: 'EXECUTED' }),
      })

    const status = await verifyInstitutionReportedExecution('0x' + '3'.repeat(64), {
      attempts: 2,
      initialDelayMs: 0,
    })

    expect(status.state).toBe(2)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('does not retry terminal non-executed intent states', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: INTENT_STATE.CANCELLED, stateName: 'CANCELLED' }),
    })

    await expect(
      verifyInstitutionReportedExecution('0x' + '4'.repeat(64), {
        attempts: 3,
        initialDelayMs: 0,
      }),
    ).rejects.toThrow('expected EXECUTED')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
