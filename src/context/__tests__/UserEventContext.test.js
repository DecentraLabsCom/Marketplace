/**
 * Unit Tests: UserEventContext
 *
 * Tests the blockchain event listener system including:
 * - ProviderAdded event handling
 * - ProviderRemoved event handling
 * - ProviderUpdated event handling
 * - ProviderAuthURIUpdated event handling
 * - React Query cache invalidation
 * - Event listener setup and configuration
 * - Hook validation
 */

import { renderHook, act } from "@testing-library/react";
import {
  UserEventProvider,
  useUserEventContext,
} from "@/context/UserEventContext";

// --- Mocks ---

// React Query mock
const mockInvalidateQueries = jest.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
};

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
}));

// wagmi hooks mock
let mockWatchContractEventHandlers = {};

jest.mock("wagmi", () => ({
  useAccount: jest.fn(() => ({
    chain: { id: 11155111, name: "Sepolia" },
  })),
  usePublicClient: jest.fn(() => ({
    chain: { id: 11155111 },
  })),
  useWatchContractEvent: jest.fn((config) => {
    // Store the onLogs callback to trigger events in tests
    if (config?.eventName && typeof config.onLogs === "function") {
      mockWatchContractEventHandlers[config.eventName] = config.onLogs;
    }
  }),
}));

// Blockchain utilities
jest.mock("@/utils/blockchain/selectChain", () => ({
  selectChain: jest.fn(() => ({
    id: 11155111,
    name: "Sepolia",
  })),
}));

// Contract info
jest.mock("@/contracts/diamond", () => ({
  contractABI: [],
  contractAddresses: {
    sepolia: "0xMockDiamondAddress",
  },
}));

// Query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  userQueryKeys: {
    providerStatus: jest.fn((address) => ["user", "providerStatus", address]),
    byAddress: jest.fn((address) => ["user", "byAddress", address]),
  },
  providerQueryKeys: {
    list: jest.fn(() => ["provider", "list"]),
    byAddress: jest.fn((address) => ["provider", "byAddress", address]),
    isLabProvider: jest.fn((address) => ["provider", "isLabProvider", address]),
    name: jest.fn((address) => ["provider", "name", address]),
    getLabProviders: jest.fn(() => ["provider", "getLabProviders"]),
  },
}));

// Logger
jest.mock("@/utils/dev/logger", () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// --- Test Suite ---

describe("UserEventContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the event handlers map completely before each test
    mockWatchContractEventHandlers = {};
  });

  describe("Provider Functionality", () => {
    test("renders and provides context without errors", () => {
      // This test verifies that the provider can be rendered and used successfully
      const { result } = renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // Provider should render without errors and provide context
      expect(result.current).toBeDefined();
    });

    test("provides empty context value", () => {
      const { result } = renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // Context value should be an empty object
      expect(result.current).toEqual({});
    });

    test("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      expect(() => {
        renderHook(() => useUserEventContext());
      }).toThrow("useUserEventContext must be used within a UserEventProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("Event Listener Setup", () => {
    test("sets up ProviderAdded event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // Verify useWatchContractEvent was called for ProviderAdded
      const providerAddedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "ProviderAdded"
      );

      expect(providerAddedCall).toBeDefined();
      expect(providerAddedCall[0].address).toBe("0xMockDiamondAddress");
      expect(providerAddedCall[0].eventName).toBe("ProviderAdded");
      expect(providerAddedCall[0].enabled).toBe(true);
    });

    test("sets up ProviderRemoved event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // Verify useWatchContractEvent was called for ProviderRemoved
      const providerRemovedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "ProviderRemoved"
      );

      expect(providerRemovedCall).toBeDefined();
      expect(providerRemovedCall[0].address).toBe("0xMockDiamondAddress");
      expect(providerRemovedCall[0].eventName).toBe("ProviderRemoved");
      expect(providerRemovedCall[0].enabled).toBe(true);
    });

    test("sets up ProviderUpdated event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // Verify useWatchContractEvent was called for ProviderUpdated
      const providerUpdatedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "ProviderUpdated"
      );

      expect(providerUpdatedCall).toBeDefined();
      expect(providerUpdatedCall[0].address).toBe("0xMockDiamondAddress");
      expect(providerUpdatedCall[0].eventName).toBe("ProviderUpdated");
      expect(providerUpdatedCall[0].enabled).toBe(true);
    });

    test("sets up ProviderAuthURIUpdated event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // Verify useWatchContractEvent was called for ProviderAuthURIUpdated
      const providerAuthCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "ProviderAuthURIUpdated"
      );

      expect(providerAuthCall).toBeDefined();
      expect(providerAuthCall[0].address).toBe("0xMockDiamondAddress");
      expect(providerAuthCall[0].eventName).toBe("ProviderAuthURIUpdated");
      expect(providerAuthCall[0].enabled).toBe(true);
    });
  });

  describe("ProviderAdded Event Handling", () => {
    test("invalidates provider list cache on ProviderAdded", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _account: "0xProvider1",
          },
        },
      ];

      // Trigger the ProviderAdded event
      act(() => {
        mockWatchContractEventHandlers.ProviderAdded(mockLogs);
      });

      // Verify provider list was invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });
    });

    test("invalidates specific provider queries on ProviderAdded", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const providerAddress = "0xProvider1";
      const mockLogs = [
        {
          args: {
            _account: providerAddress,
          },
        },
      ];

      // Trigger the ProviderAdded event
      act(() => {
        mockWatchContractEventHandlers.ProviderAdded(mockLogs);
      });

      // Verify all provider-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "isLabProvider", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["user", "providerStatus", providerAddress],
      });
    });

    test("handles multiple ProviderAdded events in one batch", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        { args: { _account: "0xProvider1" } },
        { args: { _account: "0xProvider2" } },
        { args: { _account: "0xProvider3" } },
      ];

      // Trigger the ProviderAdded event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.ProviderAdded(mockLogs);
      });

      // Verify provider list was invalidated once
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });

      // Verify each provider's queries were invalidated
      mockLogs.forEach((log) => {
        const address = log.args._account;
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["provider", "byAddress", address],
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["provider", "isLabProvider", address],
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["user", "providerStatus", address],
        });
      });
    });

    test("handles ProviderAdded event with missing address gracefully", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _account: null, // Missing address
          },
        },
      ];

      // Trigger the ProviderAdded event
      act(() => {
        mockWatchContractEventHandlers.ProviderAdded(mockLogs);
      });

      // Should only invalidate the list, not specific provider queries
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });

      // Should not try to invalidate queries for null address
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", null],
      });
    });
  });

  describe("ProviderRemoved Event Handling", () => {
    test("invalidates provider list cache on ProviderRemoved", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _account: "0xProvider1",
          },
        },
      ];

      // Trigger the ProviderRemoved event
      act(() => {
        mockWatchContractEventHandlers.ProviderRemoved(mockLogs);
      });

      // Verify provider list was invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });
    });

    test("invalidates specific provider queries on ProviderRemoved", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const providerAddress = "0xProvider1";
      const mockLogs = [
        {
          args: {
            _account: providerAddress,
          },
        },
      ];

      // Trigger the ProviderRemoved event
      act(() => {
        mockWatchContractEventHandlers.ProviderRemoved(mockLogs);
      });

      // Verify all provider-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "isLabProvider", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["user", "providerStatus", providerAddress],
      });
    });

    test("handles multiple ProviderRemoved events in one batch", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        { args: { _account: "0xProvider1" } },
        { args: { _account: "0xProvider2" } },
      ];

      // Trigger the ProviderRemoved event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.ProviderRemoved(mockLogs);
      });

      // Verify provider list was invalidated once
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });

      // Verify each provider's queries were invalidated
      mockLogs.forEach((log) => {
        const address = log.args._account;
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["provider", "byAddress", address],
        });
      });
    });
  });

  describe("ProviderUpdated Event Handling", () => {
    test("invalidates specific provider queries on ProviderUpdated", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const providerAddress = "0xProvider1";
      const mockLogs = [
        {
          args: {
            _account: providerAddress,
          },
        },
      ];

      // Trigger the ProviderUpdated event
      act(() => {
        mockWatchContractEventHandlers.ProviderUpdated(mockLogs);
      });

      // Verify provider-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "name", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["user", "byAddress", providerAddress],
      });
    });

    test("does not invalidate provider list on ProviderUpdated", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _account: "0xProvider1",
          },
        },
      ];

      // Clear previous mock calls
      mockInvalidateQueries.mockClear();

      // Trigger the ProviderUpdated event
      act(() => {
        mockWatchContractEventHandlers.ProviderUpdated(mockLogs);
      });

      // Verify provider list was NOT invalidated (update doesn't change the list)
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });
    });

    test("handles multiple ProviderUpdated events in one batch", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        { args: { _account: "0xProvider1" } },
        { args: { _account: "0xProvider2" } },
        { args: { _account: "0xProvider3" } },
      ];

      // Trigger the ProviderUpdated event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.ProviderUpdated(mockLogs);
      });

      // Verify each provider's queries were invalidated
      mockLogs.forEach((log) => {
        const address = log.args._account;
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["provider", "byAddress", address],
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["provider", "name", address],
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["user", "byAddress", address],
        });
      });
    });

    test("handles ProviderUpdated event with missing address gracefully", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _account: null, // Missing address
          },
        },
        {
          args: {
            _account: undefined, // Undefined address
          },
        },
      ];

      // Clear previous calls
      mockInvalidateQueries.mockClear();

      // Trigger the ProviderUpdated event
      act(() => {
        mockWatchContractEventHandlers.ProviderUpdated(mockLogs);
      });

      // Should not try to invalidate queries for null/undefined addresses
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", null],
      });
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", undefined],
      });
    });
  });

  describe("ProviderAuthURIUpdated Event Handling", () => {
    test("invalidates provider list and lab providers cache on ProviderAuthURIUpdated", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _provider: "0xProvider1",
          },
        },
      ];

      act(() => {
        mockWatchContractEventHandlers.ProviderAuthURIUpdated(mockLogs);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "list"],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "getLabProviders"],
      });
    });

    test("invalidates provider-specific queries on ProviderAuthURIUpdated", () => {
      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      const providerAddress = "0xProvider2";
      const mockLogs = [
        {
          args: {
            _provider: providerAddress,
          },
        },
      ];

      act(() => {
        mockWatchContractEventHandlers.ProviderAuthURIUpdated(mockLogs);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "byAddress", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["provider", "name", providerAddress],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["user", "byAddress", providerAddress],
      });
    });
  });

  describe("Event Listener Configuration", () => {
    test("event listeners are enabled when contract address and chain are valid", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // All event listeners should be enabled
      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].enabled).toBe(true);
      });
    });

    test("event listeners use correct contract address", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // All event listeners should use the correct contract address
      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].address).toBe("0xMockDiamondAddress");
      });
    });

    test("event listeners use correct ABI", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useUserEventContext(), {
        wrapper: UserEventProvider,
      });

      // All event listeners should use the contract ABI
      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].abi).toBeDefined();
      });
    });
  });
});
