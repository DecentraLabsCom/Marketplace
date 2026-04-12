/**
 * Unit tests for the useLabCredit hook.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLabCreditHook as useLabCredit } from '../useLabCredit'

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

describe('useLabCreditHook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/api/contract/institution/getInstitutionCreditBalance')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ balance: '1000' }),
        })
      }

      if (String(url).includes('/api/contract/reservation/getLabCreditAddress')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ labCreditAddress: '0xlabcredit' }),
        })
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  test('returns service credit state correctly', async () => {
    const { result } = renderHook(() => useLabCredit(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.balance).toBe(1000n)
    expect(result.current.allowance).toBe(1000n)
    expect(result.current.decimals).toBe(5)
    expect(result.current.labCreditAddress).toBe('0xlabcredit')
  })

  test('calculateReservationCost works', async () => {
    const { result } = renderHook(() => useLabCredit(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.calculateReservationCost('1', 60)).toBe(3600n)
  })

  test('refreshTokenData refetches ledger data', async () => {
    const { result } = renderHook(() => useLabCredit(), {
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

