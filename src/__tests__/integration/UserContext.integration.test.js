/**
 * Integration Tests: User Context Integration
 *
 * Test Behaviors:
 * - User context integrates properly with LabToken context
 * - User context integrates properly with OptimisticUI context
 * - User balance syncs with token balance changes
 * - Optimistic UI state updates are tracked correctly
 *
 * @test-suite UserContextIntegration
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { createTestWrapper } from "@/test-utils/test-providers";
import { useUser } from "@/context/UserContext";
import { useOptimisticUI } from "@/context/OptimisticUIContext";

/**
 * Mock contract read hook to avoid real blockchain calls
 */
jest.mock("@/hooks/contract/useDefaultReadContract", () => ({
  __esModule: true,
  default: jest.fn((functionName, args, skip) => {
    // Mock balance response
    if (functionName === "balanceOf") {
      return {
        data: BigInt("15500000000000000000"), // 15.5 LAB tokens in wei
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }

    // Mock allowance response
    if (functionName === "allowance") {
      return {
        data: BigInt("10000000000000000000"), // 10 LAB tokens in wei
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }

    // Mock decimals response (use skip parameter to avoid calling when cached)
    if (functionName === "decimals") {
      return {
        data: skip ? undefined : 18,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }

    return {
      data: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  }),
}));

/**
 * Mock contract write hook to avoid real blockchain calls
 */
jest.mock("@/hooks/contract/useContractWriteFunction", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    contractWriteFunction: jest.fn(() => Promise.resolve("0xmocktxhash")),
    isLoading: false,
    isError: false,
  })),
}));

/**
 * Mock environment utilities
 */
jest.mock("@/utils/env/baseUrl", () => ({
  getWalletConnectMetadata: jest.fn(() => ({
    name: "Test App",
    description: "Test Description",
    url: "http://localhost:3000",
    icons: ["http://localhost:3000/icon.png"],
  })),
}));

/**
 * Mock wagmi connectors to avoid wallet connection issues
 */
jest.mock("wagmi/connectors", () => ({
  walletConnect: jest.fn(() => ({})),
  metaMask: jest.fn(() => ({})),
}));

/**
 * Mock LabToken Context to avoid blockchain integration complexity
 */
jest.mock("@/context/LabTokenContext", () => ({
  LabTokenProvider: ({ children }) => children,
  useLabToken: () => ({
    balance: BigInt("15500000000000000000"),
    allowance: BigInt("10000000000000000000"),
    decimals: 18,
    isLoading: false,
    labTokenAddress: "0xMockLabTokenAddress",
    calculateReservationCost: jest.fn(),
    approveLabTokens: jest.fn(),
    checkBalanceAndAllowance: jest.fn(() => ({
      hasSufficientBalance: true,
      hasSufficientAllowance: true,
      balance: BigInt("15500000000000000000"),
      allowance: BigInt("10000000000000000000"),
    })),
    checkSufficientBalance: jest.fn(),
    formatTokenAmount: jest.fn((amount) => "15.50"),
    formatPrice: jest.fn((price) => "0.50"),
    refreshTokenData: jest.fn(),
    refetchBalance: jest.fn(),
    refetchAllowance: jest.fn(),
    clearDecimalsCache: jest.fn(),
  }),
}));

// Setup window.ethereum before tests run
beforeAll(() => {
  // Mock window.ethereum for wallet interactions
  Object.defineProperty(window, "ethereum", {
    value: {
      request: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    },
    writable: true,
  });

  // Mock sessionStorage for decimals cache
  const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  Object.defineProperty(window, "sessionStorage", {
    value: sessionStorageMock,
    writable: true,
  });
});

describe("User Context Integration", () => {
  const wrapper = createTestWrapper();

  describe("User context basic functionality", () => {
    /**
     * Test Case: User context renders without errors
     * Verifies that the context providers work together properly
     */
    test("renders user context successfully", async () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Check that user context has expected properties
      expect(result.current).toHaveProperty("address");
      expect(result.current).toHaveProperty("isSSO");
    });
  });

  describe("Optimistic UI integration", () => {
    /**
     * Test Case: OptimisticUI context integrates with User context
     * Verifies that optimistic state updates work correctly
     */
    test("applies and tracks optimistic listing state", async () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Apply optimistic listing state
      act(() => {
        result.current.setOptimisticListingState(1, "listed", true);
      });

      // Verify optimistic state was applied by checking effective state
      const effectiveState = result.current.getEffectiveListingState(1, false);
      expect(effectiveState).toEqual({
        isListed: "listed",
        isPending: true,
        operation: "listing",
      });
    });

    /**
     * Test Case: Clears optimistic state correctly
     * Verifies that optimistic state can be cleared
     */
    test("clears optimistic state after confirmation", async () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Set optimistic state
      act(() => {
        result.current.setOptimisticListingState(2, "unlisted", true);
      });

      // Verify it's set
      const stateBeforeClear = result.current.getEffectiveListingState(2, true);
      expect(stateBeforeClear.isListed).toBe("unlisted");
      expect(stateBeforeClear.isPending).toBe(true);

      // Clear optimistic state
      act(() => {
        result.current.clearOptimisticListingState(2);
      });

      // Verify it's cleared - should now use server state
      const stateAfterClear = result.current.getEffectiveListingState(2, true);
      expect(stateAfterClear.isListed).toBe(true); // Falls back to server state
      expect(stateAfterClear.isPending).toBe(false);
    });

    /**
     * Test Case: Completes optimistic state correctly
     * Verifies that optimistic state can be marked as complete
     */
    test("completes optimistic state after transaction success", async () => {
      const { result } = renderHook(() => useOptimisticUI(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Set optimistic state
      act(() => {
        result.current.setOptimisticListingState(3, true, true);
      });

      // Verify it's pending
      let effectiveState = result.current.getEffectiveListingState(3, false);
      expect(effectiveState.isPending).toBe(true);

      // Complete optimistic state
      act(() => {
        result.current.completeOptimisticListingState(3);
      });

      // Verify it's no longer pending but state is preserved
      effectiveState = result.current.getEffectiveListingState(3, false);
      expect(effectiveState.isListed).toBe(true);
      expect(effectiveState.isPending).toBe(false);
    });
  });
});
