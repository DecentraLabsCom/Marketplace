/**
 * Unit Tests: LabEventContext
 *
 * Tests the blockchain event listener system including:
 * - LabAdded event handling
 * - LabUpdated event handling
 * - LabListed event handling
 * - LabUnlisted event handling
 * - LabDeleted event handling
 * - LabURISet event handling
 * - LabReputationAdjusted event handling
 * - LabReputationSet event handling
 * - React Query cache invalidation
 * - Event listener setup and configuration
 * - Hook validation
 */

import { renderHook, act } from "@testing-library/react";
import {
  LabEventProvider,
  useLabEventContext,
} from "@/context/LabEventContext";

// Mock dependencies
const mockInvalidateQueries = jest.fn();
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
};

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
}));

// Mock wagmi hooks
const mockWatchContractEventHandlers = {};
jest.mock("wagmi", () => ({
  useAccount: jest.fn(() => ({
    chain: { id: 11155111, name: "Sepolia" },
  })),
  usePublicClient: jest.fn(() => ({})),
  useWatchContractEvent: jest.fn((config) => {
    mockWatchContractEventHandlers[config.eventName] = config.onLogs;
    return {};
  }),
}));

// Mock blockchain utilities
jest.mock("@/utils/blockchain/selectChain", () => ({
  selectChain: jest.fn((chain) => ({
    id: 11155111,
    name: "Sepolia",
  })),
}));

// Mock contract addresses
jest.mock("@/contracts/diamond", () => ({
  contractABI: [],
  contractAddresses: {
    sepolia: "0xMockDiamondAddress",
  },
}));

// Mock query keys
jest.mock("@/utils/hooks/queryKeys", () => ({
  labQueryKeys: {
    getAllLabs: jest.fn(() => ["lab", "getAllLabs"]),
    getLab: jest.fn((labId) => ["lab", "getLab", labId]),
    tokenURI: jest.fn((labId) => ["lab", "tokenURI", labId]),
    isTokenListed: jest.fn((labId) => ["lab", "isTokenListed", labId]),
    ownerOf: jest.fn((labId) => ["lab", "ownerOf", labId]),
    derivedByLabId: jest.fn((labId) => [
      ["lab", "getLab", labId],
      ["lab", "tokenURI", labId],
      ["lab", "isTokenListed", labId],
      ["lab", "ownerOf", labId],
      ["lab", "getLabReputation", labId],
    ]),
  },
}));

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe("LabEventContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset the handlers
    Object.keys(mockWatchContractEventHandlers).forEach((key) => {
      delete mockWatchContractEventHandlers[key];
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("Provider Functionality", () => {
    test("renders and provides context without errors", () => {
      // This test verifies that the provider can be rendered and used successfully
      const { result } = renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Provider should render without errors and provide context
      expect(result.current).toBeDefined();
    });

    test("provides empty context value", () => {
      const { result } = renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Context value should be an empty object
      expect(result.current).toEqual({});
    });

    test("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      expect(() => {
        renderHook(() => useLabEventContext());
      }).toThrow("useLabEventContext must be used within a LabEventProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("Event Listener Setup", () => {
    test("sets up LabAdded event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Verify useWatchContractEvent was called for LabAdded
      const labAddedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabAdded"
      );

      expect(labAddedCall).toBeDefined();
      expect(labAddedCall[0].address).toBe("0xMockDiamondAddress");
      expect(labAddedCall[0].eventName).toBe("LabAdded");
      expect(labAddedCall[0].enabled).toBe(true);
    });

    test("sets up LabUpdated event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Verify useWatchContractEvent was called for LabUpdated
      const labUpdatedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabUpdated"
      );

      expect(labUpdatedCall).toBeDefined();
      expect(labUpdatedCall[0].address).toBe("0xMockDiamondAddress");
      expect(labUpdatedCall[0].eventName).toBe("LabUpdated");
      expect(labUpdatedCall[0].enabled).toBe(true);
    });

    test("sets up LabListed event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Verify useWatchContractEvent was called for LabListed
      const labListedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabListed"
      );

      expect(labListedCall).toBeDefined();
      expect(labListedCall[0].address).toBe("0xMockDiamondAddress");
      expect(labListedCall[0].eventName).toBe("LabListed");
      expect(labListedCall[0].enabled).toBe(true);
    });

    test("sets up LabUnlisted event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Verify useWatchContractEvent was called for LabUnlisted
      const labUnlistedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabUnlisted"
      );

      expect(labUnlistedCall).toBeDefined();
      expect(labUnlistedCall[0].address).toBe("0xMockDiamondAddress");
      expect(labUnlistedCall[0].eventName).toBe("LabUnlisted");
      expect(labUnlistedCall[0].enabled).toBe(true);
    });

    test("sets up LabDeleted event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Verify useWatchContractEvent was called for LabDeleted
      const labDeletedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabDeleted"
      );

      expect(labDeletedCall).toBeDefined();
      expect(labDeletedCall[0].address).toBe("0xMockDiamondAddress");
      expect(labDeletedCall[0].eventName).toBe("LabDeleted");
      expect(labDeletedCall[0].enabled).toBe(true);
    });

    test("sets up LabURISet event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // Verify useWatchContractEvent was called for LabURISet
      const labURISetCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabURISet"
      );

      expect(labURISetCall).toBeDefined();
      expect(labURISetCall[0].address).toBe("0xMockDiamondAddress");
      expect(labURISetCall[0].eventName).toBe("LabURISet");
      expect(labURISetCall[0].enabled).toBe(true);
    });

    test("sets up LabReputationAdjusted event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const reputationAdjustedCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabReputationAdjusted"
      );

      expect(reputationAdjustedCall).toBeDefined();
      expect(reputationAdjustedCall[0].address).toBe("0xMockDiamondAddress");
      expect(reputationAdjustedCall[0].eventName).toBe("LabReputationAdjusted");
      expect(reputationAdjustedCall[0].enabled).toBe(true);
    });

    test("sets up LabReputationSet event listener", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const reputationSetCall = useWatchContractEvent.mock.calls.find(
        (call) => call[0].eventName === "LabReputationSet"
      );

      expect(reputationSetCall).toBeDefined();
      expect(reputationSetCall[0].address).toBe("0xMockDiamondAddress");
      expect(reputationSetCall[0].eventName).toBe("LabReputationSet");
      expect(reputationSetCall[0].enabled).toBe(true);
    });

    test("disables listeners when chain or address missing", () => {
      const wagmi = require("wagmi");
      wagmi.useAccount.mockReturnValueOnce({ chain: null });
      wagmi.usePublicClient.mockReturnValueOnce(null);

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const call = wagmi.useWatchContractEvent.mock.calls.find(
        (c) => c[0].eventName === "LabAdded"
      );

      expect(call[0].enabled).toBe(false);
    });
  });

  describe("LabAdded Event Handling", () => {
    test("invalidates getAllLabs cache on LabAdded", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _labId: 1n,
          },
        },
      ];

      // Trigger the LabAdded event
      act(() => {
        mockWatchContractEventHandlers.LabAdded(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify getAllLabs was invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getAllLabs"],
        exact: true,
      });
    });

    test("handles multiple LabAdded events in one batch", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        { args: { _labId: 1n } },
        { args: { _labId: 2n } },
        { args: { _labId: 3n } },
      ];

      // Trigger the LabAdded event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.LabAdded(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify getAllLabs was invalidated once
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getAllLabs"],
        exact: true,
      });
    });
  });

  describe("LabUpdated Event Handling", () => {
    test("invalidates specific lab queries on LabUpdated", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const labId = 1n;
      const mockLogs = [
        {
          args: {
            _labId: labId,
          },
        },
      ];

      // Trigger the LabUpdated event
      act(() => {
        mockWatchContractEventHandlers.LabUpdated(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify lab-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "tokenURI", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "isTokenListed", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "ownerOf", "1"],
        exact: true,
      });
    });

    test("handles multiple LabUpdated events in one batch", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        { args: { _labId: 1n } },
        { args: { _labId: 2n } },
        { args: { _labId: 3n } },
      ];

      // Trigger the LabUpdated event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.LabUpdated(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify each lab's queries were invalidated
      mockLogs.forEach((log) => {
        const labId = log.args._labId.toString();
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "getLab", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "tokenURI", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "isTokenListed", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "ownerOf", labId],
          exact: true,
        });
      });
    });

    test("handles LabUpdated event with missing labId gracefully", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _labId: null, // Missing labId
          },
        },
      ];

      // Clear previous calls
      mockInvalidateQueries.mockClear();

      // Trigger the LabUpdated event
      act(() => {
        mockWatchContractEventHandlers.LabUpdated(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Should not try to invalidate queries for null labId
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", null],
      });
    });

    test("deduplicates repeated LabUpdated logs for same lab", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        { args: { _labId: 7n } },
        { args: { _labId: 7n } },
      ];

      mockInvalidateQueries.mockClear();

      act(() => {
        mockWatchContractEventHandlers.LabUpdated(mockLogs);
        jest.advanceTimersByTime(60);
      });

      const calls = mockInvalidateQueries.mock.calls.filter(
        (call) => call[0]?.queryKey?.includes("7")
      );

      expect(calls.length).toBe(5); // derivedByLabId once each
    });
  });

  describe("LabListed Event Handling", () => {
    test("invalidates specific lab queries on LabListed", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const labId = 1n;
      const mockLogs = [
        {
          args: {
            tokenId: labId,
          },
        },
      ];

      // Trigger the LabListed event
      act(() => {
        mockWatchContractEventHandlers.LabListed(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify lab-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "isTokenListed", "1"],
        exact: true,
      });
    });

    test("handles multiple LabListed events in one batch", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        { args: { tokenId: 1n } },
        { args: { tokenId: 2n } },
        { args: { tokenId: 3n } },
      ];

      // Trigger the LabListed event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.LabListed(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify each lab's queries were invalidated
      mockLogs.forEach((log) => {
        const labId = log.args.tokenId.toString();
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "getLab", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "isTokenListed", labId],
          exact: true,
        });
      });
    });

    test("handles LabListed event with missing tokenId gracefully", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            tokenId: null, // Missing tokenId
          },
        },
      ];

      // Clear previous calls
      mockInvalidateQueries.mockClear();

      // Trigger the LabListed event
      act(() => {
        mockWatchContractEventHandlers.LabListed(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Should not try to invalidate queries for null tokenId
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", null],
      });
    });
  });

  describe("LabUnlisted Event Handling", () => {
    test("invalidates specific lab queries on LabUnlisted", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const labId = 1n;
      const mockLogs = [
        {
          args: {
            tokenId: labId,
          },
        },
      ];

      // Trigger the LabUnlisted event
      act(() => {
        mockWatchContractEventHandlers.LabUnlisted(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify lab-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "isTokenListed", "1"],
        exact: true,
      });
    });

    test("handles multiple LabUnlisted events in one batch", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [{ args: { tokenId: 1n } }, { args: { tokenId: 2n } }];

      // Trigger the LabUnlisted event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.LabUnlisted(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify each lab's queries were invalidated
      mockLogs.forEach((log) => {
        const labId = log.args.tokenId.toString();
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "getLab", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "isTokenListed", labId],
          exact: true,
        });
      });
    });

    test("skips invalidation when tokenId is null", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [{ args: { tokenId: null } }];

      mockInvalidateQueries.mockClear();

      act(() => {
        mockWatchContractEventHandlers.LabUnlisted(mockLogs);
      });

      expect(mockInvalidateQueries).not.toHaveBeenCalled();
    });

    test("does not invalidate getAllLabs for LabListed", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [{ args: { tokenId: 9n } }];

      act(() => {
        mockWatchContractEventHandlers.LabListed(mockLogs);
      });

      const callsWithGetAll = mockInvalidateQueries.mock.calls.filter(
        (call) => call[0]?.queryKey?.[1] === "getAllLabs"
      );

      expect(callsWithGetAll).toHaveLength(0);
    });
  });

  describe("LabDeleted Event Handling", () => {
    test("invalidates all related queries on LabDeleted", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const labId = 1n;
      const mockLogs = [
        {
          args: {
            _labId: labId,
          },
        },
      ];

      // Trigger the LabDeleted event
      act(() => {
        mockWatchContractEventHandlers.LabDeleted(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify all lab-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "tokenURI", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "isTokenListed", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "ownerOf", "1"],
        exact: true,
      });
      // Verify getAllLabs was also invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getAllLabs"],
        exact: true,
      });
    });

    test("handles multiple LabDeleted events in one batch", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [{ args: { _labId: 1n } }, { args: { _labId: 2n } }];

      // Trigger the LabDeleted event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.LabDeleted(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify each lab's queries were invalidated
      mockLogs.forEach((log) => {
        const labId = log.args._labId.toString();
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "getLab", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "tokenURI", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "isTokenListed", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "ownerOf", labId],
          exact: true,
        });
      });

      // Verify getAllLabs was invalidated once
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getAllLabs"],
        exact: true,
      });
    });

    test("handles LabDeleted event with missing labId gracefully", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _labId: null, // Missing labId
          },
        },
      ];

      // Trigger the LabDeleted event
      act(() => {
        mockWatchContractEventHandlers.LabDeleted(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Should invalidate getAllLabs but not specific lab queries
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getAllLabs"],
        exact: true,
      });

      // Should not try to invalidate queries for null labId
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", null],
      });
    });
  });

  describe("LabURISet Event Handling", () => {
    test("invalidates specific lab queries on LabURISet", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const labId = 1n;
      const mockLogs = [
        {
          args: {
            _labId: labId,
          },
        },
      ];

      // Trigger the LabURISet event
      act(() => {
        mockWatchContractEventHandlers.LabURISet(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify lab-specific queries were invalidated
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "tokenURI", "1"],
        exact: true,
      });
    });

    test("handles multiple LabURISet events in one batch", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        { args: { _labId: 1n } },
        { args: { _labId: 2n } },
        { args: { _labId: 3n } },
      ];

      // Trigger the LabURISet event with multiple logs
      act(() => {
        mockWatchContractEventHandlers.LabURISet(mockLogs);
        jest.advanceTimersByTime(60);
      });

      // Verify each lab's queries were invalidated
      mockLogs.forEach((log) => {
        const labId = log.args._labId.toString();
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "getLab", labId],
          exact: true,
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
          queryKey: ["lab", "tokenURI", labId],
          exact: true,
        });
      });
    });

    test("handles LabURISet event with missing labId gracefully", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            _labId: null, // Missing labId
          },
        },
      ];

      // Clear previous calls
      mockInvalidateQueries.mockClear();

      // Trigger the LabURISet event
      act(() => {
        mockWatchContractEventHandlers.LabURISet(mockLogs);
      });

      // Should not try to invalidate queries for null labId
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", null],
      });
    });
  });

  describe("LabReputation Event Handling", () => {
    test("invalidates derived lab queries on LabReputationAdjusted", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            labId: 1n,
          },
        },
      ];

      act(() => {
        mockWatchContractEventHandlers.LabReputationAdjusted(mockLogs);
        jest.advanceTimersByTime(60);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "tokenURI", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "isTokenListed", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "ownerOf", "1"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLabReputation", "1"],
        exact: true,
      });
    });

    test("invalidates derived lab queries on LabReputationSet", () => {
      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      const mockLogs = [
        {
          args: {
            labId: 2n,
          },
        },
      ];

      act(() => {
        mockWatchContractEventHandlers.LabReputationSet(mockLogs);
        jest.advanceTimersByTime(60);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLab", "2"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "tokenURI", "2"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "isTokenListed", "2"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "ownerOf", "2"],
        exact: true,
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ["lab", "getLabReputation", "2"],
        exact: true,
      });
    });
  });

  describe("Event Listener Configuration", () => {
    test("event listeners are enabled when contract address and chain are valid", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // All event listeners should be enabled
      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].enabled).toBe(true);
      });
    });

    test("event listeners use correct contract address", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // All event listeners should use the correct contract address
      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].address).toBe("0xMockDiamondAddress");
      });
    });

    test("event listeners use correct ABI", () => {
      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      // All event listeners should use the contract ABI
      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].abi).toBeDefined();
      });
    });

    test("disables listeners when contract address missing for chain", () => {
      const diamond = require("@/contracts/diamond");
      const originalAddress = diamond.contractAddresses.sepolia;
      diamond.contractAddresses.sepolia = undefined;

      const { useWatchContractEvent } = require("wagmi");

      renderHook(() => useLabEventContext(), {
        wrapper: LabEventProvider,
      });

      useWatchContractEvent.mock.calls.forEach((call) => {
        expect(call[0].enabled).toBe(false);
      });

      diamond.contractAddresses.sepolia = originalAddress;
    });
  });
});
