/**
 * Unit tests for the useLabToken hook
 *
 *
 * Tests Behaviors:
 * - Correct initialization of state from contract reads
 * - Accuracy of utility functions (e.g. calculateReservationCost)
 * - Transaction flow: approveLabTokens → tx hash returned → write function invoked
 * - Side effects triggered after successful receipts (balance & allowance refetch)
 *
 * All blockchain interactions are mocked via centralized test-utils factories
 * to ensure deterministic and isolated test behavior.
 */

// Centralized mocks for contract hooks
jest.mock("@/hooks/contract/useDefaultReadContract", () =>
  require("../../test-utils/mocks/hooks/useDefaultReadContract")
);

// wagmi mocks (account, tx receipts, etc.)
jest.mock("wagmi", () => ({
  useAccount: jest.fn(() => ({
    address: "0x123",
    chain: { id: 1, name: "ethereum" },
    isConnected: true,
  })),
  useWaitForTransactionReceipt: jest.fn(),
  useBalance: jest.fn(),
  useReadContract: jest.fn(),
  useWriteContract: jest.fn(),
}));

// Utility mocks (chain selector)
jest.mock("@/utils/blockchain/selectChain", () => ({
  selectChain: jest.fn(() => ({ id: 1, name: "ethereum" })),
}));

import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLabTokenHook as useLabToken } from "../useLabToken";

// Mock factories
const mockReadFactory = require("../../test-utils/mocks/hooks/useDefaultReadContract");
const wagmi = require("wagmi");

// React Query wrapper for hooks
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useLabTokenHook", () => {
  let refetchBalanceSpy;
  let refetchAllowanceSpy;
  let contractWriteSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    // spies for balance/allowance refetch + contract write
    refetchBalanceSpy = jest.fn();
    refetchAllowanceSpy = jest.fn();
    contractWriteSpy = jest.fn(() => Promise.resolve("0xabc"));

    // useBalance mock to return the expected balance and refetch spy
    wagmi.useBalance.mockReturnValue({
      data: { value: 1000n, decimals: 18 },
      refetch: refetchBalanceSpy,
    });

    // useDefaultReadContract mock (for on-chain LAB token address)
    mockReadFactory.mockImplementation((fnName) => {
      if (fnName === "getLabTokenAddress")
        return { data: "0x0000000000000000000000000000000000000456" };
      return { data: undefined, refetch: jest.fn() };
    });

    // useReadContract mock (for allowance/decimals)
    wagmi.useReadContract.mockImplementation((args) => {
      if (args.functionName === "allowance") {
        return { data: 500n, refetch: refetchAllowanceSpy };
      }
      if (args.functionName === "decimals") {
        return { data: 18 };
      }
      return { data: undefined, refetch: jest.fn() };
    });

    // mock write function
    wagmi.useWriteContract.mockReturnValue({
      writeContractAsync: contractWriteSpy,
    });

    // default tx receipt state
    wagmi.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
    });
  });

  test("returns initial state correctly", () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    });

    expect(result.current.balance).toBe(1000n);
    expect(result.current.allowance).toBe(500n);
    expect(result.current.decimals).toBe(18);
    expect(result.current.isLoading).toBe(false);
  });

  test("calculateReservationCost works", () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    });
    const cost = result.current.calculateReservationCost("1", 60);
    expect(cost).toBe(3600n);
  });

  test("approveLabTokens returns tx hash and calls write", async () => {
    const { result } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    });
    let tx;
    await act(async () => {
      tx = await result.current.approveLabTokens(100n);
    });
    expect(tx).toBe("0xabc");
    expect(contractWriteSpy).toHaveBeenCalled();
  });

  test("after receipt success it refetches balance & allowance", async () => {
    const { result, rerender } = renderHook(() => useLabToken(), {
      wrapper: createWrapper(),
    });

    // trigger approve to set lastTxHash
    await act(async () => {
      await result.current.approveLabTokens(123n);
    });

    // simulate receipt success
    wagmi.useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: true,
    });
    rerender();

    await waitFor(() => {
      expect(refetchBalanceSpy).toHaveBeenCalled();
      expect(refetchAllowanceSpy).toHaveBeenCalled();
    });
  });
});
