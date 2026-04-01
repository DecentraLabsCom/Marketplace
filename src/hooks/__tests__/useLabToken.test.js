/**
 * Unit tests for the useLabToken hook.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLabTokenHook as useLabToken } from '../useLabToken'

jest.mock('@/context/UserContext', () => ({
  useUser: jest.fn(() => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    isSSO: true,
    isLoggedIn: true,
  })),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useLabTokenHook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/api/contract/institution/getInstitutionCreditBalance')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ balance: '1000' }),
        })
      }

      if (String(url).includes('/api/contract/reservation/getLabTokenAddress')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ labTokenAddress: '0xlabtoken' }),
        })
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  test('returns service credit state correctly', async () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.balance).toBe(1000n)
    expect(result.current.allowance).toBe(1000n)
    expect(result.current.decimals).toBe(5)
    expect(result.current.labTokenAddress).toBe('0xlabtoken')
  })

  test('calculateReservationCost works', async () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.calculateReservationCost('1', 60)).toBe(3600n)
  })

  test('refreshTokenData refetches ledger data', async () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const initialCalls = global.fetch.mock.calls.length

    await act(async () => {
      await result.current.refreshTokenData()
    })

    expect(global.fetch.mock.calls.length).toBeGreaterThan(initialCalls)
  })
})
