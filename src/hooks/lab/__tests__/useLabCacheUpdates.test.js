/**
 * Unit Tests for useLabCacheUpdates hook
 *
 * Tests the lab cache management hook for React Query.
 *
 * Test Behaviors:
 *
 * - Adding Labs: Adds to all labs and specific lab caches
 * - Updating Labs: Updates existing labs in cache
 * - Removing Labs: Removes labs from cache and invalidates
 * - Optimistic Operations: Add, replace, and remove optimistic labs
 * - Edge Cases: Null data, missing IDs, empty caches
 *
 */

import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLabCacheUpdates } from "../useLabCacheUpdates";
import { labQueryKeys } from "@/utils/hooks/queryKeys";
import devLog from "@/utils/dev/logger";

// Mock external dependencies to isolate hook testing
jest.mock("@/utils/hooks/queryKeys", () => ({
  labQueryKeys: {
    getAllLabs: jest.fn(() => ["labs", "all"]),
    getLab: jest.fn((labId) => ["labs", "detail", labId]),
  },
}));

// Mock logger to prevent console noise during tests
jest.mock("@/utils/dev/logger");

describe("useLabCacheUpdates", () => {
  let queryClient;
  let wrapper;

  const mockLab = {
    id: "lab-1",
    labId: "lab-1",
    name: "AI Research Lab",
    provider: "OpenAI",
    price: 100,
    category: "AI",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    devLog.log = jest.fn();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Adding Labs", () => {
    test("adds lab to all labs cache", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.addLab(mockLab);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toEqual([mockLab]);
    });

    test("adds lab to specific lab cache when labId provided", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.addLab(mockLab);

      const specificLab = queryClient.getQueryData(["labs", "detail", "lab-1"]);
      expect(specificLab).toEqual(mockLab);
    });

    // Verifies insertion order (new items first)
    test("prepends new lab to existing labs", () => {
      queryClient.setQueryData(["labs", "all"], [mockLab]);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      const newLab = { ...mockLab, id: "lab-2", labId: "lab-2" };
      result.current.addLab(newLab);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toEqual([newLab, mockLab]);
    });

    // Edge case: initial empty cache
    test("handles adding lab when cache is empty", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.addLab(mockLab);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toHaveLength(1);
    });

    // Fallback mechanism: uses 'id' when 'labId' is missing
    test("uses id field when labId not present", () => {
      const labWithOnlyId = { ...mockLab, labId: undefined };
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.addLab(labWithOnlyId);

      const specificLab = queryClient.getQueryData(["labs", "detail", "lab-1"]);
      expect(specificLab).toEqual(labWithOnlyId);
    });
  });

  describe("Updating Labs", () => {
    test("updates lab in all labs cache by labId", () => {
      queryClient.setQueryData(["labs", "all"], [mockLab]);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      const updates = { price: 150, name: "Updated Lab" };
      result.current.updateLab("lab-1", updates);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs[0].price).toBe(150);
      expect(allLabs[0].name).toBe("Updated Lab");
    });

    test("updates specific lab cache", () => {
      queryClient.setQueryData(["labs", "detail", "lab-1"], mockLab);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      const updates = { price: 200 };
      result.current.updateLab("lab-1", updates);

      const specificLab = queryClient.getQueryData(["labs", "detail", "lab-1"]);
      expect(specificLab.price).toBe(200);
    });

    // ID matching fallback: matches by 'id' when 'labId' differs
    test("matches lab by id when labId does not match", () => {
      const labWithId = { ...mockLab, labId: undefined };
      queryClient.setQueryData(["labs", "all"], [labWithId]);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.updateLab("lab-1", { price: 175 });

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs[0].price).toBe(175);
    });

    // Empty cache scenario
    test("returns empty array when all labs cache is empty", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.updateLab("lab-1", { price: 150 });

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toEqual([]);
    });

    // Cache creation behavior
    test("creates new entry when specific lab cache is empty", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      const updates = { price: 150 };
      result.current.updateLab("lab-1", updates);

      const specificLab = queryClient.getQueryData(["labs", "detail", "lab-1"]);
      expect(specificLab).toEqual(updates);
    });
  });

  describe("Removing Labs", () => {
    test("removes lab from all labs cache by labId", () => {
      queryClient.setQueryData(["labs", "all"], [mockLab]);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.removeLab("lab-1");

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toEqual([]);
    });

    // ID-based removal fallback
    test("removes lab by id when labId does not match", () => {
      const labWithId = { ...mockLab, labId: undefined };
      queryClient.setQueryData(["labs", "all"], [labWithId]);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.removeLab("lab-1");

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toEqual([]);
    });

    // Empty cache handling
    test("handles removing from empty cache", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.removeLab("lab-1");

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toEqual([]);
    });
  });

  describe("Optimistic Labs", () => {
    test("adds optimistic lab with temporary id and flags", () => {
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      const labData = { name: "New Lab", provider: "TestProvider", price: 100 };
      const optimisticLab = result.current.addOptimisticLab(labData);

      expect(optimisticLab.id).toContain("temp-");
      expect(optimisticLab.labId).toContain("temp-");
      expect(optimisticLab.isPending).toBe(true);
      expect(optimisticLab.isProcessing).toBe(true);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toHaveLength(1);
    });

    // Optimistic update resolution
    test("replaces optimistic lab with real lab data", () => {
      const optimisticLab = {
        id: "temp-123",
        labId: "temp-123",
        name: "Temp Lab",
        isPending: true,
      };
      queryClient.setQueryData(["labs", "all"], [optimisticLab]);

      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.replaceOptimisticLab("temp-123", mockLab);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs[0].id).toBe("lab-1");
      expect(allLabs[0].isPending).toBeUndefined();
    });

    // Optimistic rollback behavior
    test("removes optimistic lab from cache", () => {
      const optimisticLab = {
        id: "temp-456",
        labId: "temp-456",
        name: "Temp Lab",
      };
      queryClient.setQueryData(["labs", "all"], [optimisticLab, mockLab]);

      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.removeOptimisticLab("temp-456");

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toHaveLength(1);
      expect(allLabs[0].id).toBe("lab-1");
    });

    // Cache propagation: updates both list and detail caches
    test("replaces optimistic lab and updates specific cache", () => {
      const optimisticLab = { id: "temp-789", name: "Temp Lab" };
      queryClient.setQueryData(["labs", "all"], [optimisticLab]);

      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.replaceOptimisticLab("temp-789", mockLab);

      const specificLab = queryClient.getQueryData(["labs", "detail", "lab-1"]);
      expect(specificLab).toEqual(mockLab);
    });
  });

  describe("Edge Cases", () => {
    // Missing identifier handling
    test("handles lab without labId or id", () => {
      const labNoId = { name: "Lab", provider: "Provider", price: 100 };
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.addLab(labNoId);

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs).toHaveLength(1);
    });

    // Non-existent entity update (should be no-op)
    test("handles updating non-existent lab", () => {
      queryClient.setQueryData(["labs", "all"], [mockLab]);
      const { result } = renderHook(() => useLabCacheUpdates(), { wrapper });

      result.current.updateLab("non-existent", { price: 999 });

      const allLabs = queryClient.getQueryData(["labs", "all"]);
      expect(allLabs[0].price).toBe(100);
    });
  });
});
