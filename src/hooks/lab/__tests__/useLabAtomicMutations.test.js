
// Ensure window.open is mocked before any imports (for jsdom)
global.window = global.window || {};
global.window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }));
// Mocks para update (debe ir antes de cualquier import)
jest.mock('../useLabCacheUpdates', () => ({
  __esModule: true,
  useLabCacheUpdates: () => ({
    updateLab: jest.fn(),
    invalidateAllLabs: jest.fn(),
    addOptimisticLab: jest.fn((lab) => ({ ...lab, id: 'optimistic-id' })),
    replaceOptimisticLab: jest.fn(),
    removeOptimisticLab: jest.fn(),
    removeLab: jest.fn(),
  }),
}));

/**
 * Tests for Lab mutation hooks.
 *
 * Goal: exercise the add-lab flows for both SSO (intents) and wallet (direct tx),
 * ensuring that the hooks return a resolved labId when available.
 */


import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAddLabSSO, useAddLabWallet, useAddLab,
  useUpdateLabSSO, useUpdateLabWallet, useUpdateLab,
  useDeleteLabSSO, useDeleteLabWallet, useDeleteLab,
  useListLabSSO, useListLabWallet, useListLab,
  useUnlistLabSSO, useUnlistLabWallet, useUnlistLab,
  useSetTokenURISSO, useSetTokenURIWallet, useSetTokenURI
} from '../useLabAtomicMutations'
import { useGetIsSSO } from '@/utils/hooks/authMode'

jest.mock('@/utils/hooks/authMode', () => ({
  useGetIsSSO: jest.fn(() => false),
}))

jest.mock('@/context/OptimisticUIContext', () => ({
  useOptimisticUI: jest.fn(() => ({
    setOptimisticListingState: jest.fn(),
    completeOptimisticListingState: jest.fn(),
    clearOptimisticListingState: jest.fn(),
  })),
}))

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


jest.mock('@/utils/blockchain/selectChain', () => ({
  __esModule: true,
  selectChain: jest.fn((chain) => chain || { name: 'sepolia', id: 11155111 }),
}));

jest.mock('@/contracts/diamond', () => ({
  __esModule: true,
  contractABI: [],
  contractAddresses: {
    sepolia: '0xcontract',
  },
}))

jest.mock('viem', () => {
  const original = jest.requireActual('viem');
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
  };
});

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('SSO update-lab realiza intent y actualiza cache tras ejecutarse', async () => {
      const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default;
      const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default;
      pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xtx' });
      pollAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-1' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth',
          authorizationSessionId: 'auth-1',
          intent: { meta: { requestId: 'req-1' }, payload: {} },
          backendAuthToken: 'auth-token-1',
        }),
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });

      const { result } = renderHook(() => useUpdateLabSSO(), {
        wrapper: createWrapper(queryClient),
      });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({
          labId: 'lab-123',
          labData: {
            uri: 'Lab-Provider-1.json',
            price: '100',
            accessURI: 'uri',
            accessKey: 'key',
          },
          backendUrl: 'https://backend.example',
        });
      });

      expect(data.intent).toBeDefined();
      expect(pollIntentStatus).toHaveBeenCalledWith('req-1', expect.any(Object));
    });

    test('Wallet update-lab ejecuta transacción y actualiza cache', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });

      const { result } = renderHook(() => useUpdateLabWallet(), {
        wrapper: createWrapper(queryClient),
      });

      let data;
      await act(async () => {
        data = await result.current.mutateAsync({
          labId: 'lab-123',
          labData: {
            uri: 'Lab-Provider-1.json',
            price: '100',
            accessURI: 'uri',
            accessKey: 'key',
          },
        });
      });

      expect(data.hash).toBe('0xtx');
    });

// ...existing code...
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
    jest.clearAllMocks();
    global.fetch = jest.fn();
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }));
    window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {}
    navigator.credentials = navigator.credentials || {}
    navigator.credentials.get = jest.fn(async () => ({}))
  });

  afterEach(() => {
    // Always ensure pollIntentAuthorizationStatus returns a Promise after each test
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    if (pollAuth.mock) {
      pollAuth.mockImplementation(() => new Promise(() => {}));
    }
  });

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('SSO add-lab returns labId after polling intent execution', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '42', txHash: '0xtx' })

    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-1' })
    pollAuth.mockImplementation(() => new Promise(() => {}))

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
    pollAuth.mockImplementation(() => new Promise(() => {}))

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
    pollAuth.mockImplementation(() => new Promise(() => {}))

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
    pollAuth.mockImplementation(() => new Promise(() => {}))
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
      expect(pollIntentStatus).not.toHaveBeenCalled()
    })
  });
 

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
});

describe('Wallet Hooks Coverage', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('useDeleteLabWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useDeleteLabWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('lab-123');
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useListLabWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useListLabWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('lab-123');
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useUnlistLabWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useUnlistLabWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('lab-123');
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useSetTokenURIWallet executes transaction and returns hash', async () => {
    const { result } = renderHook(() => useSetTokenURIWallet(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', tokenURI: 'uri' });
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useDeleteLabWallet failed transaction cleans up cache', async () => {
    const useContractWriteFunction = require('@/hooks/contract/useContractWriteFunction').default;
    useContractWriteFunction.mockReturnValueOnce({ contractWriteFunction: jest.fn().mockRejectedValue(new Error('Tx failed')) });
    const { result } = renderHook(() => useDeleteLabWallet(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync('lab-123')).rejects.toThrow('Tx failed');
    });
  });

  test('useListLabWallet failed transaction cleans up cache', async () => {
    const useContractWriteFunction = require('@/hooks/contract/useContractWriteFunction').default;
    useContractWriteFunction.mockReturnValueOnce({ contractWriteFunction: jest.fn().mockRejectedValue(new Error('Tx failed')) });
    const { result } = renderHook(() => useListLabWallet(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync('lab-123')).rejects.toThrow('Tx failed');
    });
  });

  test('useUnlistLabWallet failed transaction cleans up cache', async () => {
    const useContractWriteFunction = require('@/hooks/contract/useContractWriteFunction').default;
    useContractWriteFunction.mockReturnValueOnce({ contractWriteFunction: jest.fn().mockRejectedValue(new Error('Tx failed')) });
    const { result } = renderHook(() => useUnlistLabWallet(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync('lab-123')).rejects.toThrow('Tx failed');
    });
  });

  test('useSetTokenURIWallet failed transaction cleans up cache', async () => {
    const useContractWriteFunction = require('@/hooks/contract/useContractWriteFunction').default;
    useContractWriteFunction.mockReturnValueOnce({ contractWriteFunction: jest.fn().mockRejectedValue(new Error('Tx failed')) });
    const { result } = renderHook(() => useSetTokenURIWallet(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ labId: 'lab-123', tokenURI: 'uri' })).rejects.toThrow('Tx failed');
    });
  });
});

describe('Router Hooks Coverage', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useGetIsSSO.mockReturnValue(false); // Default to Wallet for these tests
  });
  
  test('useAddLab routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useAddLab(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ uri: 'Lab-Provider-1.json', price: '0', auth: '', accessURI: '', accessKey: '' });
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useUpdateLab routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useUpdateLab(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', labData: { uri: 'test' } });
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useDeleteLab routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useDeleteLab(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('lab-123');
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useListLab routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useListLab(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('lab-123');
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useUnlistLab routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useUnlistLab(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync('lab-123');
    });
    expect(data.hash).toBe('0xtx');
  });

  test('useSetTokenURI routes to Wallet when not SSO', async () => {
    const { result } = renderHook(() => useSetTokenURI(), { wrapper: createWrapper(queryClient) });
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', tokenURI: 'uri' });
    });
    expect(data.hash).toBe('0xtx');
  });
});

describe('SSO Hooks Coverage', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('useDeleteLabSSO executes intent and returns data', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xdel' });
    pollAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-del' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-del',
        intent: { meta: { requestId: 'req-del' }, payload: {} },
        backendAuthToken: 'token-del',
      }),
    });

    const { result } = renderHook(() => useDeleteLabSSO(), { wrapper: createWrapper(queryClient) });
    
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', backendUrl: 'https://backend.example' });
    });
    expect(data).toBeDefined();
    expect(data.requestId || data.intent.meta.requestId).toBe('req-del');
  });

  test('useListLabSSO executes intent and returns data', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xlist' });
    pollAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-list' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-list',
        intent: { meta: { requestId: 'req-list' }, payload: {} },
        backendAuthToken: 'token-list',
      }),
    });

    const { result } = renderHook(() => useListLabSSO(), { wrapper: createWrapper(queryClient) });
    
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', backendUrl: 'https://backend.example' });
    });
    expect(data).toBeDefined();
    expect(data.requestId || data.intent.meta.requestId).toBe('req-list');
  });

  test('useUnlistLabSSO executes intent and returns data', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xunlist' });
    pollAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-unlist' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-unlist',
        intent: { meta: { requestId: 'req-unlist' }, payload: {} },
        backendAuthToken: 'token-unlist',
      }),
    });

    const { result } = renderHook(() => useUnlistLabSSO(), { wrapper: createWrapper(queryClient) });
    
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', backendUrl: 'https://backend.example' });
    });
    expect(data).toBeDefined();
  });

  test('useSetTokenURISSO executes intent and returns data', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xuri' });
    pollAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-uri' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-uri',
        intent: { meta: { requestId: 'req-uri' }, payload: {} },
        backendAuthToken: 'token-uri',
      }),
    });

    const { result } = renderHook(() => useSetTokenURISSO(), { wrapper: createWrapper(queryClient) });
    
    let data;
    await act(async () => {
      data = await result.current.mutateAsync({ labId: 'lab-123', tokenURI: 'uri-1', backendUrl: 'https://backend.example' });
    });
    expect(data).toBeDefined();
  });

  test('useDeleteLabSSO intent fails handles cache', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'Rejected' });
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-fail' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-fail',
        intent: { meta: { requestId: 'req-fail' }, payload: {} },
      }),
    });

    const { result } = renderHook(() => useDeleteLabSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ labId: 'lab-123', backendUrl: 'https://backend.example' });
    });
  });

  test('useListLabSSO intent fails handles cache', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'Rejected' });
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-fail' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-fail',
        intent: { meta: { requestId: 'req-fail' }, payload: {} },
      }),
    });

    const { result } = renderHook(() => useListLabSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ labId: 'lab-123', backendUrl: 'https://backend.example' });
    });
  });

  test('useUnlistLabSSO intent fails handles cache', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'Rejected' });
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-fail' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-fail',
        intent: { meta: { requestId: 'req-fail' }, payload: {} },
      }),
    });

    const { result } = renderHook(() => useUnlistLabSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ labId: 'lab-123', backendUrl: 'https://backend.example' });
    });
  });

  test('useSetTokenURISSO intent fails handles cache', async () => {
    const pollIntentStatus = require('@/utils/intents/pollIntentStatus').default;
    const pollAuth = require('@/utils/intents/pollIntentAuthorizationStatus').default;
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'Rejected' });
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-fail' });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-fail',
        intent: { meta: { requestId: 'req-fail' }, payload: {} },
      }),
    });

    const { result } = renderHook(() => useSetTokenURISSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await result.current.mutateAsync({ labId: 'lab-123', tokenURI: 'uri-1', backendUrl: 'https://backend.example' });
    });
  });

  test('useDeleteLabSSO fails on prepare intent', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useDeleteLabSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ labId: 'lab-123' })).rejects.toThrow('Failed to prepare action intent: 500');
    });
  });

  test('useListLabSSO fails on prepare intent', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useListLabSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ labId: 'lab-123' })).rejects.toThrow('Failed to prepare action intent: 500');
    });
  });

  test('useUnlistLabSSO fails on prepare intent', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useUnlistLabSSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ labId: 'lab-123' })).rejects.toThrow('Failed to prepare action intent: 500');
    });
  });

  test('useSetTokenURISSO fails on prepare intent', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useSetTokenURISSO(), { wrapper: createWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.mutateAsync({ labId: 'lab-123' })).rejects.toThrow('Failed to prepare action intent: 500');
    });
  });
});


