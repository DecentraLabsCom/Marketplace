/**
 * Unit tests for the useLabToken hook.
 */

jest.mock("@/hooks/contract/useDefaultReadContract", () =>
  require("../../test-utils/mocks/hooks/useDefaultReadContract")
)

jest.mock("wagmi", () => ({
  useConnection: jest.fn(() => ({
    accounts: ["0x123"],
    chain: { id: 1, name: "ethereum" },
    status: "connected",
  })),
}))

jest.mock("@/utils/blockchain/selectChain", () => ({
  selectChain: jest.fn(() => ({ id: 1, name: "ethereum" })),
}))

import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLabTokenHook as useLabToken } from "../useLabToken"

const mockReadFactory = require("../../test-utils/mocks/hooks/useDefaultReadContract")

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useLabTokenHook", () => {
  const refetchBalanceSpy = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()

    mockReadFactory.mockImplementation((fnName) => {
      if (fnName === "getServiceCreditBalance") {
        return { data: 1000n, refetch: refetchBalanceSpy, isLoading: false }
      }
      return { data: undefined, refetch: jest.fn(), isLoading: false }
    })
  })

  test("returns service credit state correctly", () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    })

    expect(result.current.balance).toBe(1000n)
    expect(result.current.allowance).toBe(1000n)
    expect(result.current.decimals).toBe(6)
    expect(result.current.isLoading).toBe(false)
  })

  test("calculateReservationCost works", () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    })

    expect(result.current.calculateReservationCost("1", 60)).toBe(3600n)
  })

  test("refreshTokenData refetches service credit balance", async () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      result.current.refreshTokenData()
    })

    expect(refetchBalanceSpy).toHaveBeenCalled()
  })
})
