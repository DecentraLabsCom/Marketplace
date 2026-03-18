/**
 * Tests for Lab mutation hooks.
 *
 * Goal: exercise the add-lab flows for both SSO (intents) and wallet (direct tx),
 * ensuring that the hooks return a resolved labId when available.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAddLabSSO,
  useAddLabWallet,
  useDeleteLabSSO,
  useListLabSSO,
  useUnlistLabSSO,
  useUpdateLabSSO,
} from '../useLabAtomicMutations'

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

jest.mock('@/utils/intents/pollIntentAuthorizationStatus', () => ({
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

jest.mock('@/context/OptimisticUIContext', () => ({
  __esModule: true,
  useOptimisticUI: jest.fn(() => ({
    clearOptimisticListingState: jest.fn(),
    setOptimisticListingState: jest.fn(),
    completeOptimisticListingState: jest.fn(),
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
  useConnection: jest.fn(() => ({
    chain: { name: 'sepolia', id: 11155111 },
    accounts: ['0xabc'],
    status: 'connected',
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
    window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }))
    navigator.credentials = navigator.credentials || {}
    navigator.credentials.get = jest.fn(async () => ({}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('SSO add-lab returns labId after polling intent execution', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '42', txHash: '0xtx' })

    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-1' })

    // Prepare action intent (popup authorization only)
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth',
          authorizationSessionId: 'auth-1',
          intent: { meta: { requestId: 'req-1' }, payload: {} },
          backendAuthToken: 'auth-token-1',
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
        backendUrl: 'https://backend.example',
      })
    })

    expect(data.labId).toBe('42')
    expect(data.requestId).toBe('req-1')
  })

  test('SSO add-lab performs a follow-up poll when executed without labId', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed' })
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-2' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth',
          authorizationSessionId: 'auth-2',
          intent: { meta: { requestId: 'req-2' }, payload: {} },
          backendAuthToken: 'auth-token-2',
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
        backendUrl: 'https://backend.example',
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

  test('SSO add-lab aborts when authorization returns FAILED/UNKNOWN and does not poll intent execution', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default

    // Simulate authorization failing/unknown
    pollAuth.mockResolvedValueOnce({ status: 'FAILED', error: 'Denied' })

    // Prepare response includes authorization info so awaitBackendAuthorization uses pollAuth
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-1',
        intent: { meta: { requestId: 'req-auth' }, payload: {} },
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    // Ensure window.open doesn't throw and returns a mock popup
    window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }))

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          uri: 'Lab-Provider-1.json',
          price: '0',
          auth: '',
          accessURI: '',
          accessKey: '',
          backendUrl: 'https://backend.example',
        })
      ).rejects.toThrow('Denied')
    })

    // Ensure we did not proceed to poll execution
    expect(pollIntentStatus).not.toHaveBeenCalled()
  })

  test('SSO add-lab continues when authorization returns UNKNOWN with requestId', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default

    // Simulate authorization returning UNKNOWN (e.g., popup closed by backend/user)
    pollAuth.mockResolvedValueOnce({ status: 'UNKNOWN', requestId: 'req-unknown', error: 'Authorization window closed' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '42', txHash: '0xtx' })

    // Prepare response includes authorization info so awaitBackendAuthorization uses pollAuth
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-unknown',
        intent: { meta: { requestId: 'req-unknown' }, payload: {} },
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    // Ensure window.open doesn't throw and returns a mock popup
    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

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
        backendUrl: 'https://backend.example',
      })
    })

    expect(data.requestId).toBe('req-unknown')
    expect(pollIntentStatus).toHaveBeenCalled()
  })

  test('SSO add-lab succeeds when backend authorizes and auto-closes popup (grace window allows success)', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default

    // Simulate backend authorizing and auto-closing the popup
    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

    pollAuth.mockImplementationOnce(async () => {
      // backend closes popup after authorizing
      popup.closed = true
      return { status: 'SUCCESS', requestId: 'req-auto', backendAuthToken: 'auth-token' }
    })

    // Prepare response includes authorization info so awaitBackendAuthorization uses pollAuth
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-auto',
        backendAuthToken: 'auth-token',
        intent: { meta: { requestId: 'req-auto' }, payload: {} },
      }),
    })

    // Execution poll returns executed with labId
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '55', txHash: '0xhash' })

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
        backendUrl: 'https://backend.example',
      })
    })

    expect(data.labId).toBe('55')
    expect(data.requestId).toBe('req-auto')
    expect(pollIntentStatus).toHaveBeenCalledWith('req-auto', expect.objectContaining({ authToken: 'auth-token', backendUrl: 'https://backend.example' }))
  })

  test('SSO add-lab succeeds when popup posts SUCCESS message', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default

    pollAuth.mockImplementationOnce(() => new Promise(() => {}))
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '99', txHash: '0xhash' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-msg',
        intent: { meta: { requestId: 'req-msg' }, payload: {} },
      }),
    })

    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      const promise = result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        backendUrl: 'https://backend.example',
      })

      await new Promise((resolve) => setTimeout(resolve, 0))
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://backend.example',
        data: { type: 'intent-authorization', status: 'SUCCESS', requestId: 'req-msg' },
      }))

      data = await promise
    })

    expect(data.labId).toBe('99')
    expect(data.requestId).toBe('req-msg')
  })

  test('SSO add-lab rejects when popup posts CANCELLED message', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default

    pollAuth.mockImplementationOnce(() => new Promise(() => {}))

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-msg-cancel',
        intent: { meta: { requestId: 'req-cancel' }, payload: {} },
      }),
    })

    const popup = { closed: false, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      const promise = result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        backendUrl: 'https://backend.example',
      })

      await new Promise((resolve) => setTimeout(resolve, 0))
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://backend.example',
        data: { type: 'intent-authorization', status: 'CANCELLED', requestId: 'req-cancel' },
      }))

      await expect(promise).rejects.toThrow()
    })

    expect(pollIntentStatus).not.toHaveBeenCalled()
  })

  test('SSO add-lab succeeds when popup auto-closes and intent presence is detected (presenceFn)', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default

    // Prepare: pollAuth never resolves so popupClosedPromise would win, but we use presenceFn to shortcut
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockImplementationOnce(() => new Promise(() => {}))

    // Prepare response includes authorization info so awaitBackendAuthorization has session
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-pres',
        intent: { meta: { requestId: 'req-pres' }, payload: {} },
      }),
    })

    // After presence detected (via presenceFn), execution poll returns executed
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '77', txHash: '0xhash' })

    const popup = { closed: true, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

    const presenceFn = jest.fn(async () => 'present')

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
        backendUrl: 'https://backend.example',
        presenceFn,
      })
    })

    expect(data.labId).toBe('77')
    expect(pollIntentStatus).toHaveBeenCalledWith('req-pres', expect.objectContaining({ backendUrl: 'https://backend.example' }))
    expect(presenceFn).toHaveBeenCalledWith('req-pres', expect.any(Object))
  })

  test('SSO add-lab rejects when popup auto-closes and intent is absent (presenceFn)', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockImplementationOnce(() => new Promise(() => {}))

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-abs',
        intent: { meta: { requestId: 'req-abs' }, payload: {} },
      }),
    })

    const popup = { closed: true, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

    const presenceFn = jest.fn(async () => 'absent')

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })),
    })

    await act(async () => {
      const promise = result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        backendUrl: 'https://backend.example',
        presenceFn,
      })

      await expect(promise).rejects.toThrow()
    })

    expect(presenceFn).toHaveBeenCalledWith('req-abs', expect.any(Object))
  })

  test('SSO add-lab rejects when popup auto-closes and intent is absent', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockImplementationOnce(() => new Promise(() => {}))

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth',
          authorizationSessionId: 'auth-abs',
          intent: { meta: { requestId: 'req-abs' }, payload: {} },
        }),
      })
      // pollIntentPresence fetch -> 404 (absent)
      .mockResolvedValueOnce({ ok: false, status: 404 })

    const popup = { closed: true, focus: jest.fn(), close: jest.fn(), opener: null }
    window.open = jest.fn(() => popup)

    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })),
    })

    await act(async () => {
      const promise = result.current.mutateAsync({
        uri: 'Lab-Provider-1.json',
        price: '0',
        auth: '',
        accessURI: '',
        accessKey: '',
        backendUrl: 'https://backend.example',
      })

      await expect(promise).rejects.toThrow()
    })
  })
})

describe('useLabAtomicMutations (list/unlist SSO)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {}
    window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }))
    navigator.credentials = navigator.credentials || {}
    navigator.credentials.get = jest.fn(async () => ({}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('SSO list waits for executed intent before succeeding', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-list-1' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xlisttx' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-list-1',
        intent: { meta: { requestId: 'req-list-1' }, payload: {} },
        backendAuthToken: 'auth-token-list-1',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useListLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        labId: 5,
        backendUrl: 'https://backend.example',
      })
    })

    expect(data.status).toBe('executed')
    expect(data.txHash).toBe('0xlisttx')
    expect(pollIntentStatus).toHaveBeenCalledWith(
      'req-list-1',
      expect.objectContaining({ authToken: 'auth-token-list-1', backendUrl: 'https://backend.example' })
    )
    expect(queryClient.getQueryData(['labs', 'isTokenListed', 5])).toEqual({ isListed: true })
  })

  test('SSO unlist waits for executed intent before succeeding', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-unlist-1' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xunlisttx' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-unlist-1',
        intent: { meta: { requestId: 'req-unlist-1' }, payload: {} },
        backendAuthToken: 'auth-token-unlist-1',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result } = renderHook(() => useUnlistLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    let data
    await act(async () => {
      data = await result.current.mutateAsync({
        labId: 6,
        backendUrl: 'https://backend.example',
      })
    })

    expect(data.status).toBe('executed')
    expect(data.txHash).toBe('0xunlisttx')
    expect(pollIntentStatus).toHaveBeenCalledWith(
      'req-unlist-1',
      expect.objectContaining({ authToken: 'auth-token-unlist-1', backendUrl: 'https://backend.example' })
    )
    expect(queryClient.getQueryData(['labs', 'isTokenListed', 6])).toEqual({ isListed: false })
  })
})

describe('useLabAtomicMutations (update/delete SSO)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {}
    window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }))
    navigator.credentials = navigator.credentials || {}
    navigator.credentials.get = jest.fn(async () => ({}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('SSO update keeps getAllLabs as ids and reconciles detail cache after executed intent', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-update-1' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xupdatetx' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-update-1',
        intent: { meta: { requestId: 'req-update-1' }, payload: {} },
        backendAuthToken: 'auth-token-update-1',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['labs', 'getAllLabs'], [12])
    queryClient.setQueryData(['labs', 'getLab', 12], {
      id: 12,
      labId: 12,
      base: {
        uri: 'old-uri.json',
        price: '100',
        accessURI: 'https://old.example/lab',
        accessKey: 'old-key',
      },
      name: 'Legacy lab',
    })

    const { result } = renderHook(() => useUpdateLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        labId: 12,
        labData: {
          uri: 'new-uri.json',
          price: '200',
          accessURI: 'https://new.example/lab',
          accessKey: 'new-key',
          tokenURI: 'ipfs://lab-12',
          name: 'Updated lab',
        },
        backendUrl: 'https://backend.example',
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(['labs', 'getLab', 12])).toMatchObject({
        id: 12,
        labId: 12,
        name: 'Updated lab',
        isIntentPending: false,
        intentStatus: 'executed',
        transactionHash: '0xupdatetx',
      })
    })

    expect(queryClient.getQueryData(['labs', 'getLab', 12]).base).toEqual({
      uri: 'new-uri.json',
      price: '200',
      accessURI: 'https://new.example/lab',
      accessKey: 'new-key',
      tokenURI: 'ipfs://lab-12',
    })
    expect(queryClient.getQueryData(['labs', 'getAllLabs'])).toEqual([12])
    expect(pollIntentStatus).toHaveBeenCalledWith(
      'req-update-1',
      expect.objectContaining({ authToken: 'auth-token-update-1', backendUrl: 'https://backend.example' })
    )
  })

  test('SSO delete removes lab id from getAllLabs after executed intent', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-delete-1' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xdeletetx' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-delete-1',
        intent: { meta: { requestId: 'req-delete-1' }, payload: {} },
        backendAuthToken: 'auth-token-delete-1',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['labs', 'getAllLabs'], [21, 22])
    queryClient.setQueryData(['labs', 'getLab', 21], {
      id: 21,
      labId: 21,
      name: 'Lab to delete',
    })

    const { result } = renderHook(() => useDeleteLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        labId: 21,
        backendUrl: 'https://backend.example',
      })
    })

    await waitFor(() => {
      expect(queryClient.getQueryData(['labs', 'getAllLabs'])).toEqual([22])
    })

    expect(pollIntentStatus).toHaveBeenCalledWith(
      'req-delete-1',
      expect.objectContaining({ authToken: 'auth-token-delete-1', backendUrl: 'https://backend.example' })
    )
  })
})

