jest.mock('@/app/api/contract/utils/getProvider', () => ({
  __esModule: true,
  default: jest.fn(),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
  },
}))

import getProvider from '@/app/api/contract/utils/getProvider'
import { extractOnchainErrorDetails, resolveChainNowSec } from '../onchainHelpers'

describe('onchainHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('extracts stable and nested RPC error fields without throwing on partial errors', () => {
    const error = {
      message: 'execution reverted',
      shortMessage: 'reverted',
      reason: 'IntentExpired',
      code: 'CALL_EXCEPTION',
      errorName: 'IntentExpired',
      errorSignature: 'IntentExpired()',
      data: '0xdeadbeef',
      info: { error: { message: 'rpc reverted' } },
    }

    expect(extractOnchainErrorDetails(error)).toEqual({
      message: 'execution reverted',
      shortMessage: 'reverted',
      reason: 'IntentExpired',
      code: 'CALL_EXCEPTION',
      errorName: 'IntentExpired',
      errorSignature: 'IntentExpired()',
      data: '0xdeadbeef',
      rpcMessage: 'rpc reverted',
    })
    expect(extractOnchainErrorDetails(undefined)).toEqual({
      message: null,
      shortMessage: null,
      reason: null,
      code: null,
      errorName: null,
      errorSignature: null,
      data: null,
      rpcMessage: null,
    })
  })

  test('uses chain time with a small safety margin', async () => {
    getProvider.mockResolvedValue({
      getBlock: jest.fn().mockResolvedValue({ timestamp: 1_700_000_100 }),
    })

    await expect(resolveChainNowSec()).resolves.toBe(1_700_000_070)
  })

  test('falls back to local time when the chain timestamp is unavailable', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    getProvider.mockResolvedValue({
      getBlock: jest.fn().mockResolvedValue({ timestamp: 0 }),
    })

    await expect(resolveChainNowSec()).resolves.toBe(1_699_999_970)
  })

  test('falls back to local time when the RPC provider fails', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    getProvider.mockRejectedValue(new Error('RPC unavailable'))

    await expect(resolveChainNowSec()).resolves.toBe(1_699_999_970)
  })
})
