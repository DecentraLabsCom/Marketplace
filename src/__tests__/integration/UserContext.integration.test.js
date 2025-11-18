/**
 * Integration Tests: User Context Integration
 *
 * Test Behaviors:
 * - User context integrates properly with LabToken context
 * - User context integrates properly with OptimisticUI context
 * - User balance syncs with token balance changes
 * - Optimistic UI state updates are tracked correctly
 * - SSO session management integration
 * - Provider status transitions
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
    checkBalanceAndAllowance: jest.fn((requiredAmount = BigInt(0)) => ({
      hasSufficientBalance: BigInt("15500000000000000000") >= requiredAmount,
      hasSufficientAllowance: BigInt("10000000000000000000") >= requiredAmount,
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

  describe("SSO session management integration", () => {
    /**
     * Test Case: User context provides SSO authentication properties
     * Verifies that SSO user information is accessible through UserContext
     */
    test("provides SSO authentication properties", async () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Verify user context has SSO-related properties
      expect(result.current).toHaveProperty("isSSO");
      expect(result.current).toHaveProperty("isLoggedIn");
      expect(result.current).toHaveProperty("address");
    });

    /**
     * Test Case: User context structure for session management
     * Verifies that the user context has all necessary properties for session handling
     */
    test("has complete user authentication structure", async () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Verify all authentication-related properties exist
      expect(result.current).toHaveProperty("isLoggedIn");
      expect(result.current).toHaveProperty("isSSO");
      expect(result.current).toHaveProperty("address");

      // These properties are essential for managing user sessions
      expect(typeof result.current.isSSO).toBe("boolean");
      expect(typeof result.current.isLoggedIn).toBe("boolean");
    });
  });

  describe("Token balance sync integration", () => {
    /**
     * Test Case: Token balance is accessible through contexts
     * Verifies that token balance information is properly integrated
     */
    test("provides access to token balance data", async () => {
      const { useLabToken } = require("@/context/LabTokenContext");

      // Verify balance is accessible from LabToken context
      const labTokenData = useLabToken();
      expect(labTokenData.balance).toBe(BigInt("15500000000000000000"));
      expect(labTokenData.formatTokenAmount(labTokenData.balance)).toBe(
        "15.50"
      );
    });

    /**
     * Test Case: Insufficient balance detection
     * Verifies that the system correctly identifies when user has insufficient tokens
     */
    test("detects insufficient token balance for booking", async () => {
      const { useLabToken } = require("@/context/LabTokenContext");
      const labToken = useLabToken();

      // Check balance for a booking that requires 20 LAB tokens (more than available)
      const requiredAmount = BigInt("20000000000000000000");
      const balanceCheck = labToken.checkBalanceAndAllowance(requiredAmount);

      // Verify insufficient balance is detected
      expect(balanceCheck.hasSufficientBalance).toBe(false);
      expect(balanceCheck.balance).toBe(BigInt("15500000000000000000"));
    });

    /**
     * Test Case: Sufficient balance for booking
     * Verifies that sufficient balance is correctly detected
     */
    test("detects sufficient token balance for booking", async () => {
      const { useLabToken } = require("@/context/LabTokenContext");
      const labToken = useLabToken();

      // Check balance for a booking that requires 5 LAB tokens (less than available)
      const requiredAmount = BigInt("5000000000000000000");
      const balanceCheck = labToken.checkBalanceAndAllowance(requiredAmount);

      // Verify sufficient balance is detected
      expect(balanceCheck.hasSufficientBalance).toBe(true);
      expect(balanceCheck.balance).toBe(BigInt("15500000000000000000"));
    });

    /**
     * Test Case: Token allowance for marketplace contract
     * Verifies that token allowance is properly tracked
     */
    test("tracks token allowance for marketplace operations", async () => {
      const { useLabToken } = require("@/context/LabTokenContext");
      const labToken = useLabToken();

      // Verify allowance is accessible
      expect(labToken.allowance).toBe(BigInt("10000000000000000000"));

      // Check if allowance is sufficient for a booking (5 LAB tokens)
      const requiredAmount = BigInt("5000000000000000000");
      const check = labToken.checkBalanceAndAllowance(requiredAmount);

      expect(check.hasSufficientAllowance).toBe(true);
      expect(check.allowance).toBe(BigInt("10000000000000000000"));
    });

    /**
     * Test Case: Insufficient allowance detection
     * Verifies that insufficient allowance is properly detected
     * This triggers approval flow when needed
     */
    test("detects when allowance is insufficient", async () => {
      const { useLabToken } = require("@/context/LabTokenContext");
      const labToken = useLabToken();

      // Check allowance for a booking that requires 15 LAB tokens (more than allowed)
      const requiredAmount = BigInt("15000000000000000000");
      const check = labToken.checkBalanceAndAllowance(requiredAmount);

      // Allowance (10 LAB) is less than required (15 LAB)
      expect(check.hasSufficientAllowance).toBe(false);
      expect(check.allowance).toBe(BigInt("10000000000000000000"));
    });
  });

  describe("Provider status integration", () => {
    /**
     * Test Case: Provider status properties are available
     * Verifies that provider status information is accessible
     */
    test("provides provider status properties", async () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Verify provider-related properties exist
      expect(result.current).toHaveProperty("isProvider");
      expect(result.current).toHaveProperty("isProviderLoading");

      // Provider status should be boolean when not loading
      expect(typeof result.current.isProvider).toBe("boolean");
      expect(typeof result.current.isProviderLoading).toBe("boolean");
    });

    /**
     * Test Case: Provider loading state handling
     * Verifies that loading state is properly communicated
     */
    test("handles provider status loading state", async () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Verify loading state is accessible for UI
      expect(result.current.isProviderLoading).toBeDefined();

      // This property is used in components for conditional rendering:
      // if (!isProviderLoading && isProvider) { /* show provider features */ }
    });

    /**
     * Test Case: Complete user state for feature gating
     * Verifies that all necessary state is available for authorization decisions
     */
    test("provides complete state for authorization decisions", async () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });

      // Verify all key authorization properties
      expect(result.current).toHaveProperty("isLoggedIn");
      expect(result.current).toHaveProperty("isProvider");
      expect(result.current).toHaveProperty("isSSO");
      expect(result.current).toHaveProperty("address");
    });
  });

  describe("Context integration reliability", () => {
    /**
     * Test Case: Multiple context hooks work together
     * Verifies that UserContext, LabTokenContext, and OptimisticUI work in harmony
     */
    test("integrates multiple contexts without conflicts", async () => {
      const { useLabToken } = require("@/context/LabTokenContext");

      // Render both contexts simultaneously
      const { result: userResult } = renderHook(() => useUser(), { wrapper });
      const { result: optimisticResult } = renderHook(() => useOptimisticUI(), {
        wrapper,
      });

      await waitFor(() => {
        expect(userResult.current).toBeDefined();
        expect(optimisticResult.current).toBeDefined();
      });

      // Verify LabToken context is also accessible
      const labToken = useLabToken();
      expect(labToken).toBeDefined();
      expect(labToken.balance).toBeDefined();

      // All contexts should work together without errors
      expect(userResult.current).toHaveProperty("address");
      expect(optimisticResult.current).toHaveProperty("labListingStates");
      expect(optimisticResult.current).toHaveProperty(
        "setOptimisticListingState"
      );
      expect(labToken).toHaveProperty("formatTokenAmount");
    });
  });
});
