jest.mock('@/utils/intents/adminIntentSigner', () => ({
  getIntentOnChain: jest.fn(),
  expireIntentOnChain: jest.fn(),
}))

jest.mock('@/utils/intents/intentNonceStore', () => ({
  getServerSignerAddress: jest.fn(() => '0xsigner'),
  withIntentSignerLock: jest.fn((_signer, callback) => callback()),
}))

jest.mock('@/utils/intents/intentLifecycleStore', () => ({
  getRegisteredIntent: jest.fn(),
  listRegisteredIntentIds: jest.fn(),
  removeRegisteredIntent: jest.fn(),
}))

import { getIntentOnChain, expireIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  getRegisteredIntent,
  listRegisteredIntentIds,
  removeRegisteredIntent,
} from '@/utils/intents/intentLifecycleStore'
import { reconcileTrackedIntents } from '../intentLifecycleReconciler'
import { INTENT_STATE } from '../intentState'

describe('intent lifecycle reconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listRegisteredIntentIds.mockResolvedValue(['req-expired', 'req-executed'])
    getRegisteredIntent
      .mockResolvedValueOnce({ requestId: 'req-expired', expiresAt: '99' })
      .mockResolvedValueOnce({ requestId: 'req-executed', expiresAt: '500' })
    getIntentOnChain
      .mockResolvedValueOnce({ state: INTENT_STATE.EXPIRED, stateName: 'expired' })
      .mockResolvedValueOnce({ state: INTENT_STATE.EXECUTED, stateName: 'executed' })
    expireIntentOnChain.mockResolvedValue({ status: 'expired', txHash: '0xexpire' })
  })

  test('materializes expired intents and removes terminal lifecycle records', async () => {
    const result = await reconcileTrackedIntents({ nowSec: 100 })

    expect(expireIntentOnChain).toHaveBeenCalledWith('req-expired')
    expect(removeRegisteredIntent).toHaveBeenCalledWith('req-expired')
    expect(removeRegisteredIntent).toHaveBeenCalledWith('req-executed')
    expect(result).toEqual([
      { requestId: 'req-expired', status: 'expired' },
      { requestId: 'req-executed', status: 'executed' },
    ])
  })

  test('keeps a genuinely pending intent tracked before its deadline', async () => {
    getRegisteredIntent.mockReset()
    getIntentOnChain.mockReset()
    expireIntentOnChain.mockReset()
    listRegisteredIntentIds.mockResolvedValue(['req-pending'])
    getRegisteredIntent.mockResolvedValue({ requestId: 'req-pending', expiresAt: '500' })
    getIntentOnChain.mockResolvedValue({ state: INTENT_STATE.PENDING, stateName: 'pending' })

    const result = await reconcileTrackedIntents({ nowSec: 100 })

    expect(expireIntentOnChain).not.toHaveBeenCalled()
    expect(removeRegisteredIntent).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  test('keeps a submitted registration tracked while its transaction is not mined', async () => {
    getRegisteredIntent.mockReset()
    getIntentOnChain.mockReset()
    expireIntentOnChain.mockReset()
    listRegisteredIntentIds.mockResolvedValue(['req-submitted'])
    getRegisteredIntent.mockResolvedValue({
      requestId: 'req-submitted',
      txHash: '0xregistration',
      expiresAt: '500',
    })
    getIntentOnChain.mockResolvedValue({ state: INTENT_STATE.NONE, stateName: 'none' })

    const result = await reconcileTrackedIntents({ nowSec: 100 })

    expect(result).toEqual([
      { requestId: 'req-submitted', status: 'registration_pending' },
    ])
    expect(removeRegisteredIntent).not.toHaveBeenCalled()
  })

  test('coalesces concurrent reconciliation runs for the same process', async () => {
    getRegisteredIntent.mockReset()
    getIntentOnChain.mockReset()
    expireIntentOnChain.mockReset()
    listRegisteredIntentIds.mockResolvedValue(['req-concurrent'])
    getRegisteredIntent.mockResolvedValue({ requestId: 'req-concurrent', expiresAt: '99' })
    getIntentOnChain.mockResolvedValue({ state: INTENT_STATE.PENDING, stateName: 'pending' })
    expireIntentOnChain.mockResolvedValue({ status: 'expired', txHash: '0xexpire' })

    const [first, second] = await Promise.all([
      reconcileTrackedIntents({ nowSec: 100 }),
      reconcileTrackedIntents({ nowSec: 100 }),
    ])

    expect(getIntentOnChain).toHaveBeenCalledTimes(1)
    expect(expireIntentOnChain).toHaveBeenCalledTimes(1)
    expect(removeRegisteredIntent).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
  })

  test('keeps the lifecycle record when the on-chain backend is temporarily unavailable', async () => {
    getRegisteredIntent.mockReset()
    getIntentOnChain.mockReset()
    listRegisteredIntentIds.mockResolvedValue(['req-backend-down'])
    getRegisteredIntent.mockResolvedValue({ requestId: 'req-backend-down', expiresAt: '500' })
    getIntentOnChain.mockRejectedValue(new Error('RPC unavailable'))

    await expect(reconcileTrackedIntents({ nowSec: 100 })).resolves.toEqual([
      { requestId: 'req-backend-down', status: 'reconcile_failed', error: 'RPC unavailable' },
    ])
    expect(removeRegisteredIntent).not.toHaveBeenCalled()
  })
})
