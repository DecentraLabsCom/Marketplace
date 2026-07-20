jest.mock('@/utils/intents/adminIntentSigner', () => ({
  getIntentOnChain: jest.fn(),
  expireIntentOnChain: jest.fn(),
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

describe('intent lifecycle reconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listRegisteredIntentIds.mockResolvedValue(['req-expired', 'req-executed'])
    getRegisteredIntent
      .mockResolvedValueOnce({ requestId: 'req-expired', expiresAt: '99' })
      .mockResolvedValueOnce({ requestId: 'req-executed', expiresAt: '500' })
    getIntentOnChain
      .mockResolvedValueOnce({ state: 3, stateName: 'expired' })
      .mockResolvedValueOnce({ state: 1, stateName: 'executed' })
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
})
