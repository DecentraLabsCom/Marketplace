import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  getLabOperationalStatus,
  useLabOperationalStatuses,
} from '../useLabOperationalStatus'
import { marketQueryKeys } from '@/utils/hooks/queryKeys'

const status = (labId, state, reason = 'station_ready') => ({
  labId: String(labId),
  state,
  reason,
  source: 'lab_station_heartbeat',
  observedAt: '2026-09-23T10:00:00Z',
  ageSeconds: 4,
  severity: state === 'busy' ? 'warning' : 'positive',
})

const createWrapper = (queryClient) => ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 60_000 },
  },
})

const jsonResponse = (payload) => ({
  ok: true,
  json: async () => payload,
})

describe('useLabOperationalStatuses', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('selects the resource capability instead of global station readiness', () => {
    const statusWithCapabilities = {
      ...status('7', 'not_ready', 'station_not_ready'),
      capabilities: {
        physicalLab: { ...status('7', 'ready'), reason: 'station_ready' },
        fmu: { ...status('7', 'not_ready'), reason: 'fmu_not_ready', severity: 'critical' },
      },
    }

    expect(getLabOperationalStatus({ '7': statusWithCapabilities }, '7', 'lab').state).toBe('ready')
    expect(getLabOperationalStatus({ '7': statusWithCapabilities }, '7', 'fmu').state).toBe('not_ready')
  })

  test('synchronizes a LabDetail refresh into the cached catalogue batch', async () => {
    const queryClient = createQueryClient()
    const unknown = status('7', 'unknown', 'status_unavailable')
    queryClient.setQueryData(
      marketQueryKeys.labStatuses(['7', '8']),
      { '7': unknown, '8': status('8', 'ready') },
    )
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      statuses: [status('7', 'busy', 'local_session_active')],
    }))

    const { result } = renderHook(
      () => useLabOperationalStatuses(['7']),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data['7'].state).toBe('busy')
    await waitFor(() => expect(
      queryClient.getQueryData(marketQueryKeys.labStatuses(['7', '8']))['7'].state,
    ).toBe('busy'))
  })

  test('seeds the single-lab cache when the catalogue fetch returns statuses', async () => {
    const queryClient = createQueryClient()
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      statuses: [status('7', 'busy', 'local_session_active'), status('8', 'ready')],
    }))

    const { result } = renderHook(
      () => useLabOperationalStatuses(['7', '8']),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data['7'].state).toBe('busy')
    expect(queryClient.getQueryData(marketQueryKeys.labStatus('7')).state).toBe('busy')
  })

  test('does not mark an unknown catalogue signal as fresh for LabDetail', async () => {
    const queryClient = createQueryClient()
    const unknown = status('7', 'unknown', 'status_unavailable')
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ statuses: [unknown] }))
      .mockResolvedValueOnce(jsonResponse({
        statuses: [status('7', 'busy', 'local_session_active')],
      }))

    const catalogue = renderHook(
      () => useLabOperationalStatuses(['7', '8']),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(catalogue.result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryState(marketQueryKeys.labStatus('7')).dataUpdatedAt).toBe(0)
    catalogue.unmount()

    const detail = renderHook(
      () => useLabOperationalStatuses(['7']),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(detail.result.current.data['7'].state).toBe('busy'))
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('keeps a known status when a later catalogue response is transiently unknown', async () => {
    const queryClient = createQueryClient()
    const busy = status('7', 'busy', 'local_session_active')
    queryClient.setQueryData(
      marketQueryKeys.labStatus('7'),
      busy,
    )
    queryClient.setQueryData(
      marketQueryKeys.labStatuses(['7', '8']),
      { '7': busy, '8': status('8', 'ready') },
    )
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      statuses: [{
        ...status('7', 'unknown', 'gateway_unavailable'),
        source: 'status_unavailable',
        observedAt: null,
        ageSeconds: null,
      }],
    }))

    const { result } = renderHook(
      () => useLabOperationalStatuses(['7', '8'], {
        queryOptions: { staleTime: 0 },
      }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data['7'].state).toBe('busy')
    expect(queryClient.getQueryData(marketQueryKeys.labStatus('7')).state).toBe('busy')
  })

  test('does not replace a fresher status with another state that has weaker evidence', async () => {
    const queryClient = createQueryClient()
    const ready = status('7', 'ready', 'station_ready')
    queryClient.setQueryData(marketQueryKeys.labStatus('7'), ready)
    queryClient.setQueryData(
      marketQueryKeys.labStatuses(['7', '8']),
      { '7': ready, '8': status('8', 'ready') },
    )
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      statuses: [{
        ...status('7', 'reachable', 'target_reachable'),
        source: 'guacamole_tcp_probe',
        observedAt: null,
        ageSeconds: null,
      }],
    }))

    const { result } = renderHook(
      () => useLabOperationalStatuses(['7', '8'], {
        queryOptions: { staleTime: 0 },
      }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data['7'].state).toBe('ready')
    expect(queryClient.getQueryData(marketQueryKeys.labStatus('7')).state).toBe('ready')
  })
})
