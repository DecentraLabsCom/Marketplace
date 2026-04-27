/**
 * Tests for institutional lab mutation hooks.
 */

import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAddLabSSO,
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

jest.mock('@/context/OptimisticUIContext', () => ({
  __esModule: true,
  useOptimisticUI: jest.fn(() => ({
    clearOptimisticListingState: jest.fn(),
    setOptimisticListingState: jest.fn(),
    completeOptimisticListingState: jest.fn(),
  })),
}))

jest.mock('@/context/UserContext', () => ({
  __esModule: true,
  useOptionalUser: jest.fn(() => ({ institutionBackendUrl: 'https://backend.example' })),
}))

const createWrapper = (queryClient) => {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('institutional lab mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    jest.spyOn(Date, 'now').mockReturnValue(1000)

    window.PublicKeyCredential = window.PublicKeyCredential || function PublicKeyCredential() {}
    window.open = jest.fn(() => ({ closed: false, focus: jest.fn(), close: jest.fn(), opener: null }))
    navigator.credentials = navigator.credentials || {}
    navigator.credentials.get = jest.fn(async () => ({}))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('add-lab returns labId after polling intent execution', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', labId: '42', txHash: '0xtx' })
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-1' })

    global.fetch.mockResolvedValueOnce({
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
        accessURI: '',
        accessKey: '',
        backendUrl: 'https://backend.example',
      })
    })

    expect(data.labId).toBe('42')
    expect(data.requestId).toBe('req-1')
  })

  test('add-lab performs a follow-up poll when executed without labId', async () => {
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
        accessURI: '',
        accessKey: '',
        backendUrl: 'https://backend.example',
        postExecutePollInitialDelayMs: 1,
        postExecutePollMaxDurationMs: 1000,
      })
    })

    expect(data.labId).toBe('77')
    expect(data.txHash).toBe('0xhash')
  })

  test('list and unlist mutations resolve through institutional intents', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth
      .mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-list' })
      .mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-unlist' })
    pollIntentStatus
      .mockResolvedValueOnce({ status: 'executed', txHash: '0xlist' })
      .mockResolvedValueOnce({ status: 'executed', txHash: '0xunlist' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth/list',
          authorizationSessionId: 'auth-list',
          intent: { meta: { requestId: 'req-list' }, payload: {} },
          backendAuthToken: 'auth-list',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth/unlist',
          authorizationSessionId: 'auth-unlist',
          intent: { meta: { requestId: 'req-unlist' }, payload: {} },
          backendAuthToken: 'auth-unlist',
        }),
      })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result: listResult } = renderHook(() => useListLabSSO(), { wrapper: createWrapper(queryClient) })
    const { result: unlistResult } = renderHook(() => useUnlistLabSSO(), { wrapper: createWrapper(queryClient) })

    await act(async () => {
      await listResult.current.mutateAsync({ labId: '4', backendUrl: 'https://backend.example' })
      await unlistResult.current.mutateAsync({ labId: '4', backendUrl: 'https://backend.example' })
    })

    expect(pollIntentStatus).toHaveBeenCalledTimes(2)
  })

  test('list mutation does not poison listing cache to false when polling fails', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-list-fail' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'backend timeout after execution window' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth/list',
        authorizationSessionId: 'auth-list-fail',
        intent: { meta: { requestId: 'req-list-fail' }, payload: {} },
        backendAuthToken: 'auth-list-fail',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    queryClient.setQueryData(['labs', 'isTokenListed', '4'], { isListed: true })

    const { result } = renderHook(() => useListLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ labId: '4', backendUrl: 'https://backend.example' })
      ).rejects.toThrow('backend timeout after execution window')
    })

    expect(queryClient.getQueryData(['labs', 'isTokenListed', '4'])).toEqual({ isListed: true })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['labs', 'isTokenListed', '4'],
      exact: true,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['labs', 'getAllLabs'],
      exact: true,
    })
  })

  test('update and delete mutations prepare institutional intents', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth
      .mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-update' })
      .mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-delete' })
    pollIntentStatus
      .mockResolvedValueOnce({ status: 'executed', txHash: '0xupdate' })
      .mockResolvedValueOnce({ status: 'executed', txHash: '0xdelete' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth/update',
          authorizationSessionId: 'auth-update',
          intent: { meta: { requestId: 'req-update' }, payload: {} },
          backendAuthToken: 'auth-update',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth/delete',
          authorizationSessionId: 'auth-delete',
          intent: { meta: { requestId: 'req-delete' }, payload: {} },
          backendAuthToken: 'auth-delete',
        }),
      })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    const { result: updateResult } = renderHook(() => useUpdateLabSSO(), { wrapper: createWrapper(queryClient) })
    const { result: deleteResult } = renderHook(() => useDeleteLabSSO(), { wrapper: createWrapper(queryClient) })

    await act(async () => {
      await updateResult.current.mutateAsync({
        labId: '9',
        labData: { uri: 'updated.json', price: '10', accessURI: '', accessKey: '' },
        backendUrl: 'https://backend.example',
      })
      await deleteResult.current.mutateAsync({ labId: '9', backendUrl: 'https://backend.example' })
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
