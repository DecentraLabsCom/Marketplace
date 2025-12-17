/**
 * Tests for Lab mutation hooks.
 *
 * Goal: exercise the add-lab flows for both SSO (intents) and wallet (direct tx),
 * ensuring that the hooks return a resolved labId when available.
 */

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAddLabSSO, useAddLabWallet } from '../useLabAtomicMutations'

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}))

jest.mock('@/utils/intents/pollIntentStatus', () => ({
  __esModule: true,
  default: jest.fn(),
}))

jest.mock('@/utils/webauthn/client', () => ({
  __esModule: true,
  transformAssertionOptions: jest.fn(() => ({ challenge: 'challenge' })),
  assertionToJSON: jest.fn(() => ({
    response: {
      clientDataJSON: 'clientData',
      authenticatorData: 'authData',
      signature: 'sig',
    },
  })),
}))

jest.mock('@/hooks/contract/useContractWriteFunction', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    contractWriteFunction: jest.fn(async () => '0xtx'),
  })),
}))

jest.mock('@/utils/blockchain/selectChain', () => ({
  __esModule: true,
  selectChain: jest.fn((chain) => chain || { name: 'sepolia', id: 11155111 }),
}))

jest.mock('@/contracts/diamond', () => ({
  __esModule: true,
  contractABI: [],
  contractAddresses: {
    sepolia: '0xcontract',
  },
}))

jest.mock('viem', () => {
  const original = jest.requireActual('viem')
  return {
    ...original,
    decodeEventLog: jest.fn(() => ({
      eventName: 'LabAdded',
      args: {
        _labId: 42n,
        _provider: '0xabc',
        _uri: 'Lab-Provider-1.json',
      },
    })),
  }
})

jest.mock('wagmi', () => ({
  __esModule: true,
  useAccount: jest.fn(() => ({
    chain: { name: 'sepolia', id: 11155111 },
    address: '0xabc',
    isConnected: true,
  })),
  usePublicClient: jest.fn(() => ({
    waitForTransactionReceipt: jest.fn(async () => ({
      logs: [{ address: '0xcontract', data: '0x', topics: [] }],
    })),
    readContract: jest.fn(async ({ functionName }) => {
      if (functionName === 'balanceOf') return 1n
      if (functionName === 'tokenOfOwnerByIndex') return 99n
      if (functionName === 'tokenURI') return 'Lab-Provider-1.json'
      return null
    }),
  })),
}))

const createWrapper = (queryClient) => {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useLabAtomicMutations (add lab)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    jest.spyOn(Date, 'now').mockReturnValue(1000)

    // WebAuthn availability
    window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {}
    navigator.credentials = navigator.credentials || {}
    navigator.credentials.get = jest.fn(async () => ({}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('SSO add-lab returns labId after polling intent execution', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '42', txHash: '0xtx' })

    // Prepare + finalize action intent
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webauthnChallenge: 'challenge',
          allowCredentials: [],
          intent: { meta: { requestId: 'req-1' }, payload: {} },
          adminSignature: 'adminSig',
          webauthnCredentialId: 'cred',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          intent: { meta: { requestId: 'req-1' } },
        }),
      })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        gatewayUrl: 'https://gateway.example',
      })
    })

    expect(data.labId).toBe('42')
    expect(data.requestId).toBe('req-1')
  })

  test('SSO add-lab performs a follow-up poll when executed without labId', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webauthnChallenge: 'challenge',
          allowCredentials: [],
          intent: { meta: { requestId: 'req-2' }, payload: {} },
          adminSignature: 'adminSig',
          webauthnCredentialId: 'cred',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          intent: { meta: { requestId: 'req-2' } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'executed', labId: '77', txHash: '0xhash' }),
      })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        gatewayUrl: 'https://gateway.example',
        postExecutePollInitialDelayMs: 1,
        postExecutePollMaxDurationMs: 1_000,
      })
    })

    expect(data.labId).toBe('77')
    expect(data.requestId).toBe('req-2')
    expect(data.txHash).toBe('0xhash')
  })

  test('Wallet add-lab decodes LabAdded from receipt and returns labId', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useAddLabWallet(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
      })
    })

    expect(data.hash).toBe('0xtx')
    expect(data.labId).toBe('42')
  })

  test('Wallet add-lab falls back to scanning owner tokens when event decode fails', async () => {
    const { decodeEventLog } = await import('viem')
    decodeEventLog.mockImplementationOnce(() => {
      throw new Error('decode failed')
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useAddLabWallet(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        scanLookbackCount: 5,
      })
    })

    expect(data.hash).toBe('0xtx')
    expect(data.labId).toBe('99')
  })
})
