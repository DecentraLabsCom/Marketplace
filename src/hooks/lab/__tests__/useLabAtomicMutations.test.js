/**
 * Tests for institutional lab mutation hooks.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAddLabSSO,
  useDeleteLabSSO,
  useListLabSSO,
  useUnlistLabSSO,
  useUpdateLabSSO,
} from '../useLabAtomicMutations'
import { labQueryKeys, marketQueryKeys } from '@/utils/hooks/queryKeys'

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

jest.mock('@/utils/intents/verifyOnchainIntentStatus', () => ({
  __esModule: true,
  verifyInstitutionReportedExecution: jest.fn(() => Promise.resolve({ state: 2, stateName: 'EXECUTED' })),
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
  beforeEach(async () => {
    jest.clearAllMocks()
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollIntentStatus.mockReset()
    pollAuth.mockReset()
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
    const { verifyInstitutionReportedExecution } = await import('@/utils/intents/verifyOnchainIntentStatus')
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
    expect(verifyInstitutionReportedExecution).toHaveBeenCalledWith('req-1', expect.any(Object))
  })

  test('does not poll execution when authorization is not confirmed', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'PENDING_AUTHORIZATION', requestId: 'req-pending' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth',
        authorizationSessionId: 'auth-pending',
        intent: { meta: { requestId: 'req-pending' }, payload: {} },
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { result } = renderHook(() => useAddLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          uri: 'Lab-Provider-1.json',
          price: '0',
          accessURI: '',
          accessKey: '',
          backendUrl: 'https://backend.example',
        })
      ).rejects.toMatchObject({ code: 'INTENT_AUTH_NOT_CONFIRMED' })
    })

    expect(pollIntentStatus).not.toHaveBeenCalled()
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

    const prepareResponses = [
      {
        authorizationUrl: 'https://backend.example/auth/list',
        authorizationSessionId: 'auth-list',
        intent: { meta: { requestId: 'req-list' }, payload: {} },
        backendAuthToken: 'auth-list',
      },
      {
        authorizationUrl: 'https://backend.example/auth/unlist',
        authorizationSessionId: 'auth-unlist',
        intent: { meta: { requestId: 'req-unlist' }, payload: {} },
        backendAuthToken: 'auth-unlist',
      },
    ]
    global.fetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/metadata?')) {
        return { ok: true, json: async () => ({ name: 'Listed lab', description: 'Ready for reservations' }) }
      }
      if (url === '/api/market/invalidate') {
        return { ok: true, json: async () => ({ invalidated: true }) }
      }
      return { ok: true, json: async () => prepareResponses.shift() }
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

  test('invalidates the public market catalogue after listing a lab', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-list-cache' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xlist-cache' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Listed lab', description: 'Ready for reservations' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth/list-cache',
          authorizationSessionId: 'auth-list-cache',
          intent: { meta: { requestId: 'req-list-cache' }, payload: {} },
          backendAuthToken: 'auth-list-cache',
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ invalidated: true }) })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useListLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({ labId: '4', backendUrl: 'https://backend.example' })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: marketQueryKeys.all(),
    })
  })

  test('list mutation does not poison listing cache to false when polling fails', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-list-fail' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'backend timeout after execution window' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Listed lab', description: 'Ready for reservations' }),
      })
      .mockResolvedValueOnce({
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

  test('does not register a listing intent when metadata preflight fails', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Metadata document was not found', code: 'EXTERNAL_NOT_FOUND' }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { result } = renderHook(() => useListLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ labId: '4', backendUrl: 'https://backend.example' })
      ).rejects.toMatchObject({ code: 'LAB_METADATA_PREFLIGHT_FAILED' })
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(pollAuth).not.toHaveBeenCalled()
  })

  test('does not register a listing intent when a declared metadata asset is unavailable', async () => {
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Listed lab',
          description: 'Ready for reservations',
          image: 'https://lab.example.edu/images/cover.png',
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { result } = renderHook(() => useListLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ labId: '4', backendUrl: 'https://backend.example' })
      ).rejects.toMatchObject({ code: 'LAB_METADATA_ASSET_PREFLIGHT_FAILED' })
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(pollAuth).not.toHaveBeenCalled()
  })

  test('update and delete mutations prepare institutional intents', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValue({ status: 'SUCCESS', requestId: 'req-update' })
    pollIntentStatus.mockResolvedValue({ status: 'executed', txHash: '0xupdate' })

    const prepareResponses = [
      {
        authorizationUrl: 'https://backend.example/auth/update',
        authorizationSessionId: 'auth-update',
        intent: { meta: { requestId: 'req-update' }, payload: {} },
        backendAuthToken: 'auth-update',
      },
      {
        authorizationUrl: 'https://backend.example/auth/delete',
        authorizationSessionId: 'auth-delete',
        intent: { meta: { requestId: 'req-delete' }, payload: {} },
        backendAuthToken: 'auth-delete',
      },
    ]
    global.fetch.mockImplementation(async (url) => {
      if (url === '/api/market/invalidate') {
        return { ok: true, json: async () => ({ invalidated: true }) }
      }
      return { ok: true, json: async () => prepareResponses.shift() }
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

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

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketQueryKeys.all(),
      })
    })
  })

  test('invalidates lab and public market caches after an update intent executes', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-update-cache' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'executed', txHash: '0xupdate-cache' })

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authorizationUrl: 'https://backend.example/auth/update-cache',
          authorizationSessionId: 'auth-update-cache',
          intent: { meta: { requestId: 'req-update-cache' }, payload: {} },
          backendAuthToken: 'auth-update-cache',
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ invalidated: true }) })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useUpdateLabSSO(), {
      wrapper: createWrapper(queryClient),
    })

    await act(async () => {
      await result.current.mutateAsync({
        labId: '4',
        labData: { uri: 'Lab-provider-4.json', price: '10', accessURI: '', accessKey: '' },
        backendUrl: 'https://backend.example',
      })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: labQueryKeys.getLab('4'),
        exact: true,
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: marketQueryKeys.all(),
      })
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/market/invalidate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ labId: '4' }),
    }))
  })

  test('delete mutation does not resolve before the institutional execution succeeds', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-delete-failed' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'Cannot delete lab with uncollected reservations' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth/delete',
        authorizationSessionId: 'auth-delete',
        intent: { meta: { requestId: 'req-delete-failed' }, payload: {} },
        backendAuthToken: 'auth-delete',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { result } = renderHook(() => useDeleteLabSSO(), { wrapper: createWrapper(queryClient) })

    await expect(
      act(async () => result.current.mutateAsync({ labId: '9', backendUrl: 'https://backend.example' }))
    ).rejects.toThrow('Cannot delete lab with uncollected reservations')
  })

  test('update mutation does not resolve before the institutional execution succeeds', async () => {
    const pollIntentStatus = (await import('@/utils/intents/pollIntentStatus')).default
    const pollAuth = (await import('@/utils/intents/pollIntentAuthorizationStatus')).default
    pollAuth.mockResolvedValueOnce({ status: 'SUCCESS', requestId: 'req-update-failed' })
    pollIntentStatus.mockResolvedValueOnce({ status: 'failed', reason: 'Lab update rejected by institution' })

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorizationUrl: 'https://backend.example/auth/update',
        authorizationSessionId: 'auth-update-failed',
        intent: { meta: { requestId: 'req-update-failed' }, payload: {} },
        backendAuthToken: 'auth-update-failed',
      }),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const { result } = renderHook(() => useUpdateLabSSO(), { wrapper: createWrapper(queryClient) })

    await expect(
      act(async () => result.current.mutateAsync({
        labId: '9',
        labData: { uri: 'updated.json', price: '10', accessURI: '', accessKey: '' },
        backendUrl: 'https://backend.example',
      }))
    ).rejects.toThrow('Lab update rejected by institution')
  })
})
