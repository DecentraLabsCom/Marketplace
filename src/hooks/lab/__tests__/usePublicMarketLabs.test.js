import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePublicMarketLabs } from '../usePublicMarketLabs'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('usePublicMarketLabs', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('uses the SSR page without issuing a duplicate hydration request', () => {
    const initialData = {
      labs: [{ id: 1, name: 'SSR lab' }],
      totalLabs: 50,
      cursor: 0,
      nextCursor: '24',
      snapshotAt: new Date().toISOString(),
    }

    const { result } = renderHook(
      () => usePublicMarketLabs({ initialData }),
      { wrapper: createWrapper() },
    )

    expect(result.current.data.labs).toEqual(initialData.labs)
    expect(result.current.isLoading).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('fetches the next cursor page only when requested', async () => {
    const initialData = {
      labs: [{ id: 1, name: 'SSR lab' }],
      totalLabs: 50,
      cursor: 0,
      nextCursor: '24',
      snapshotAt: new Date().toISOString(),
    }
    global.fetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({
        labs: [{ id: 25, name: 'Next lab' }],
        totalLabs: 50,
        cursor: 24,
        nextCursor: null,
        snapshotAt: new Date().toISOString(),
      }),
    })

    const { result } = renderHook(
      () => usePublicMarketLabs({ initialData }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.fetchNextPage()
    })

    await waitFor(() => expect(result.current.data.labs).toHaveLength(2))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/market/labs?includeUnlisted=false&cursor=24&limit=24',
      { headers: { Accept: 'application/json' } },
    )
  })
})
