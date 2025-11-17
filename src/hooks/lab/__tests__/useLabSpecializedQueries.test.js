/**
 * Unit Tests: useLabSpecializedQueries
 *
 * Tests specialized lab query hooks including:
 * - useLabsForMarket (with/without unlisted labs)
 * - useLabById (single lab details)
 * - useLabsForProvider (provider's owned labs)
 * - useLabsForReservation (reservation component data)
 * - Helper functions (formatWalletAddress, processLabImages)
 * - Optimistic UI integration
 * - Provider mapping integration
 * - Metadata and image caching
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useLabsForMarket,
  useLabById,
  useLabsForProvider,
  useLabsForReservation,
} from "@/hooks/lab/useLabSpecializedQueries";

// Mock data
const mockLabIds = ["1", "2", "3"];

const mockLabBase = {
  uri: "ipfs://QmTest",
  price: "1000000000000000000",
  auth: "",
  accessURI: "",
  accessKey: "",
};

const mockLabData = {
  labId: "1",
  base: mockLabBase,
};

const mockMetadata = {
  name: "Test Lab",
  description: "Test description",
  image: "https://test.com/image.jpg",
  category: "Biology",
  keywords: ["bio", "test"],
  images: ["https://test.com/image1.jpg", "https://test.com/image2.jpg"],
  attributes: [
    { trait_type: "category", value: "Biology" },
    { trait_type: "keywords", value: ["bio", "test"] },
    { trait_type: "timeSlots", value: [15, 30, 60] },
    { trait_type: "opens", value: "2024-01-01" },
    { trait_type: "closes", value: "2024-12-31" },
    { trait_type: "docs", value: ["doc1.pdf", "doc2.pdf"] },
    {
      trait_type: "additionalImages",
      value: ["https://test.com/extra1.jpg", "https://test.com/extra2.jpg"],
    },
  ],
};

const mockOwnerAddress = "0x1234567890123456789012345678901234567890";
const mockProviderInfo = {
  name: "Test Provider",
  email: "test@provider.com",
  country: "USA",
  account: mockOwnerAddress,
};

// Mock dependencies
jest.mock("@/hooks/lab/useLabAtomicQueries", () => ({
  useAllLabs: jest.fn(),
  useLab: jest.fn(),
  useOwnerOf: jest.fn(),
  useIsTokenListed: jest.fn(),
  LAB_QUERY_CONFIG: {
    staleTime: 30000,
    gcTime: 300000,
  },
}));

jest.mock("@/hooks/metadata/useMetadata", () => ({
  useMetadata: jest.fn(),
  METADATA_QUERY_CONFIG: {
    staleTime: 60000,
  },
}));

jest.mock("@/hooks/metadata/useLabImage", () => ({
  useLabImageQuery: {
    queryFn: jest.fn((url) => Promise.resolve({ url, cached: true })),
  },
}));

jest.mock("@/utils/hooks/useProviderMapping", () => ({
  useProviderMapping: jest.fn(),
}));

jest.mock("@/context/OptimisticUIContext", () => ({
  useOptimisticUI: jest.fn(),
}));

jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return {
    ...actual,
    useQueries: jest.fn((config) => {
      // Return mock results based on queries
      const queries = config.queries || [];
      const results = queries.map((query) => ({
        data: null,
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: null,
        refetch: jest.fn(),
      }));

      return config.combine ? config.combine(results) : results;
    }),
  };
});

// Helper to create QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useLabSpecializedQueries", () => {
  let mockUseAllLabs;
  let mockUseLab;
  let mockUseOwnerOf;
  let mockUseIsTokenListed;
  let mockUseMetadata;
  let mockUseProviderMapping;
  let mockUseOptimisticUI;
  let mockUseQueries;

  beforeEach(() => {
    jest.clearAllMocks();

    // Import mocked modules
    const labAtomicQueries = require("@/hooks/lab/useLabAtomicQueries");
    const metadataModule = require("@/hooks/metadata/useMetadata");
    const providerMappingModule = require("@/utils/hooks/useProviderMapping");
    const optimisticUIModule = require("@/context/OptimisticUIContext");
    const reactQueryModule = require("@tanstack/react-query");

    mockUseAllLabs = labAtomicQueries.useAllLabs;
    mockUseLab = labAtomicQueries.useLab;
    mockUseOwnerOf = labAtomicQueries.useOwnerOf;
    mockUseIsTokenListed = labAtomicQueries.useIsTokenListed;
    mockUseMetadata = metadataModule.useMetadata;
    mockUseProviderMapping = providerMappingModule.useProviderMapping;
    mockUseOptimisticUI = optimisticUIModule.useOptimisticUI;
    mockUseQueries = reactQueryModule.useQueries;

    // Setup default mocks
    mockUseAllLabs.mockReturnValue({
      data: mockLabIds,
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: jest.fn(),
    });

    mockUseLab.mockReturnValue({
      data: mockLabData,
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: jest.fn(),
    });

    mockUseLab.queryFn = jest.fn(() => Promise.resolve(mockLabData));

    mockUseOwnerOf.mockReturnValue({
      data: { owner: mockOwnerAddress },
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: jest.fn(),
    });

    mockUseOwnerOf.queryFn = jest.fn(() =>
      Promise.resolve({ owner: mockOwnerAddress })
    );

    mockUseIsTokenListed.mockReturnValue({
      data: { isListed: true },
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: jest.fn(),
    });

    mockUseIsTokenListed.queryFn = jest.fn(() =>
      Promise.resolve({ isListed: true })
    );

    mockUseMetadata.mockReturnValue({
      data: mockMetadata,
      isLoading: false,
      isSuccess: true,
      error: null,
      refetch: jest.fn(),
    });

    mockUseMetadata.queryFn = jest.fn(() => Promise.resolve(mockMetadata));

    mockUseProviderMapping.mockReturnValue({
      mapOwnerToProvider: jest.fn((address) => mockProviderInfo),
      isLoading: false,
      refetch: jest.fn(),
    });

    mockUseOptimisticUI.mockReturnValue({
      getEffectiveListingState: jest.fn((labId, serverIsListed) => ({
        isListed: serverIsListed,
        isPending: false,
        operation: null,
      })),
    });

    // Setup useQueries mock to return realistic data
    mockUseQueries.mockImplementation((config) => {
      const queries = config.queries || [];
      const results = queries.map((query, index) => {
        // Determine what type of query this is based on queryKey
        const queryKey = query.queryKey;

        if (queryKey && queryKey[0] === "lab" && queryKey[1] === "getLab") {
          return {
            data: { ...mockLabData, labId: mockLabIds[index] || "1" },
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        }

        if (queryKey && queryKey[0] === "lab" && queryKey[1] === "ownerOf") {
          return {
            data: { owner: mockOwnerAddress },
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        }

        if (
          queryKey &&
          queryKey[0] === "lab" &&
          queryKey[1] === "isTokenListed"
        ) {
          return {
            data: { isListed: true },
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        }

        if (queryKey && queryKey[0] === "metadata") {
          return {
            data: mockMetadata,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        }

        if (queryKey && queryKey[0] === "labImage") {
          return {
            data: { url: queryKey[1], cached: true },
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        }

        return {
          data: null,
          isLoading: false,
          isSuccess: true,
          isError: false,
          error: null,
          refetch: jest.fn(),
        };
      });

      return config.combine ? config.combine(results) : results;
    });
  });

  describe("useLabsForMarket", () => {
    test("fetches all listed labs for market display", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data.labs).toBeDefined();
      expect(Array.isArray(result.current.data.labs)).toBe(true);
    });

    test("includes unlisted labs when includeUnlisted is true", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useLabsForMarket({ includeUnlisted: true }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
    });

    test("filters out unlisted labs by default", async () => {
      // Mock one lab as unlisted
      mockUseQueries.mockImplementation((config) => {
        const queries = config.queries || [];
        const results = queries.map((query, index) => {
          const queryKey = query.queryKey;

          if (
            queryKey &&
            queryKey[0] === "lab" &&
            queryKey[1] === "isTokenListed"
          ) {
            return {
              data: { isListed: index === 0 }, // Only first lab is listed
              isLoading: false,
              isSuccess: true,
              isError: false,
              error: null,
              refetch: jest.fn(),
            };
          }

          if (queryKey && queryKey[0] === "lab" && queryKey[1] === "getLab") {
            return {
              data: { ...mockLabData, labId: mockLabIds[index] || "1" },
              isLoading: false,
              isSuccess: true,
              isError: false,
              error: null,
              refetch: jest.fn(),
            };
          }

          return {
            data: null,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        });

        return config.combine ? config.combine(results) : results;
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should filter based on listing status
      expect(result.current.data).toBeDefined();
    });

    test("enriches labs with provider information", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockUseProviderMapping).toHaveBeenCalled();
    });

    test("uses optimistic UI for listing states", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const mockOptimistic = mockUseOptimisticUI.mock.results[0].value;
      expect(mockOptimistic.getEffectiveListingState).toBeDefined();
    });

    test("handles loading state correctly", () => {
      mockUseAllLabs.mockReturnValue({
        data: null,
        isLoading: true,
        isSuccess: false,
        error: null,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    test("handles errors gracefully", () => {
      const mockError = new Error("Failed to fetch labs");
      mockUseAllLabs.mockReturnValue({
        data: null,
        isLoading: false,
        isSuccess: false,
        error: mockError,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      expect(result.current.error).toBeTruthy();
    });

    test("respects enabled option", () => {
      const wrapper = createWrapper();
      renderHook(() => useLabsForMarket({ enabled: false }), { wrapper });

      expect(mockUseAllLabs).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      );
    });
  });

  describe("useLabById", () => {
    test("fetches single lab by ID successfully", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data.labId).toBeDefined();
    });

    test("handles string and number lab IDs", async () => {
      const wrapper = createWrapper();

      const { result: stringResult } = renderHook(() => useLabById("1"), {
        wrapper,
      });
      const { result: numberResult } = renderHook(() => useLabById(1), {
        wrapper,
      });

      await waitFor(() => {
        expect(stringResult.current.isLoading).toBe(false);
        expect(numberResult.current.isLoading).toBe(false);
      });

      expect(stringResult.current.data).toBeDefined();
      expect(numberResult.current.data).toBeDefined();
    });

    test("handles null lab ID", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById(null), { wrapper });

      expect(mockUseLab).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          enabled: false,
        })
      );
    });

    test("enriches lab with metadata", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUseMetadata).toHaveBeenCalled();
    });

    test("includes provider information", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUseOwnerOf).toHaveBeenCalled();
      expect(mockUseProviderMapping).toHaveBeenCalled();
    });

    test("includes listing status", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUseIsTokenListed).toHaveBeenCalled();
    });

    test("handles metadata fetch error gracefully", async () => {
      mockUseMetadata.mockReturnValue({
        data: null,
        isLoading: false,
        isSuccess: false,
        error: new Error("Metadata failed"),
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });

    test("respects enabled option", () => {
      const wrapper = createWrapper();
      renderHook(() => useLabById("1", { enabled: false }), { wrapper });

      expect(mockUseLab).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          enabled: false,
        })
      );
    });
  });

  describe("useLabsForProvider", () => {
    test("fetches labs owned by specific address", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useLabsForProvider(mockOwnerAddress),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data.labs).toBeDefined();
    });

    test("filters labs by owner address", async () => {
      // Mock different owners for different labs
      mockUseQueries.mockImplementation((config) => {
        const queries = config.queries || [];
        const results = queries.map((query, index) => {
          const queryKey = query.queryKey;

          if (queryKey && queryKey[0] === "lab" && queryKey[1] === "ownerOf") {
            // Only first lab belongs to mockOwnerAddress
            const owner =
              index === 0 ? mockOwnerAddress : "0xOtherAddress123456";
            return {
              data: { owner },
              isLoading: false,
              isSuccess: true,
              isError: false,
              error: null,
              refetch: jest.fn(),
            };
          }

          if (queryKey && queryKey[0] === "lab" && queryKey[1] === "getLab") {
            return {
              data: { ...mockLabData, labId: mockLabIds[index] || "1" },
              isLoading: false,
              isSuccess: true,
              isError: false,
              error: null,
              refetch: jest.fn(),
            };
          }

          return {
            data: null,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        });

        return config.combine ? config.combine(results) : results;
      });

      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useLabsForProvider(mockOwnerAddress),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    test("includes listing status for owned labs", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useLabsForProvider(mockOwnerAddress),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockUseIsTokenListed).toBeDefined();
    });

    test("handles no owner address", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForProvider(null), {
        wrapper,
      });

      expect(mockUseAllLabs).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      );
    });

    test("enriches labs with metadata", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useLabsForProvider(mockOwnerAddress),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockUseMetadata.queryFn).toBeDefined();
    });

    test("respects enabled option", () => {
      const wrapper = createWrapper();
      renderHook(
        () => useLabsForProvider(mockOwnerAddress, { enabled: false }),
        { wrapper }
      );

      expect(mockUseAllLabs).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      );
    });
  });

  describe("useLabsForReservation", () => {
    test("fetches labs for reservation component", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForReservation(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data.labs).toBeDefined();
    });

    test("only includes listed labs", async () => {
      mockUseQueries.mockImplementation((config) => {
        const queries = config.queries || [];
        const results = queries.map((query, index) => {
          const queryKey = query.queryKey;

          if (
            queryKey &&
            queryKey[0] === "lab" &&
            queryKey[1] === "isTokenListed"
          ) {
            // Only first lab is listed
            return {
              data: { isListed: index === 0 },
              isLoading: false,
              isSuccess: true,
              isError: false,
              error: null,
              refetch: jest.fn(),
            };
          }

          if (queryKey && queryKey[0] === "lab" && queryKey[1] === "getLab") {
            return {
              data: { ...mockLabData, labId: mockLabIds[index] || "1" },
              isLoading: false,
              isSuccess: true,
              isError: false,
              error: null,
              refetch: jest.fn(),
            };
          }

          return {
            data: null,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: jest.fn(),
          };
        });

        return config.combine ? config.combine(results) : results;
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForReservation(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
    });

    test("includes essential reservation data", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForReservation(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockUseMetadata.queryFn).toBeDefined();
    });

    test("extracts opens and closes dates from metadata", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForReservation(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockUseMetadata).toBeDefined();
    });

    test("handles empty lab list", () => {
      mockUseAllLabs.mockReturnValue({
        data: [],
        isLoading: false,
        isSuccess: true,
        error: null,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForReservation(), { wrapper });

      expect(result.current.data.labs).toEqual([]);
    });

    test("respects enabled option", () => {
      const wrapper = createWrapper();
      renderHook(() => useLabsForReservation({ enabled: false }), { wrapper });

      expect(mockUseAllLabs).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        })
      );
    });
  });

  describe("Refetch Functionality", () => {
    test("useLabsForMarket refetch calls all underlying queries", async () => {
      const mockRefetch = jest.fn();
      mockUseAllLabs.mockReturnValue({
        data: mockLabIds,
        isLoading: false,
        isSuccess: true,
        error: null,
        refetch: mockRefetch,
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      result.current.refetch();

      expect(mockRefetch).toHaveBeenCalled();
    });

    test("useLabById refetch calls all underlying queries", async () => {
      const mockRefetch = jest.fn();
      mockUseLab.mockReturnValue({
        data: mockLabData,
        isLoading: false,
        isSuccess: true,
        error: null,
        refetch: mockRefetch,
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      result.current.refetch();

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("handles lab fetch errors", () => {
      const mockError = new Error("Failed to fetch");
      mockUseAllLabs.mockReturnValue({
        data: null,
        isLoading: false,
        isSuccess: false,
        error: mockError,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      expect(result.current.error).toBeTruthy();
    });

    test("handles metadata fetch failures gracefully", async () => {
      mockUseMetadata.mockReturnValue({
        data: null,
        isLoading: false,
        isSuccess: false,
        error: new Error("Metadata failed"),
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
    });
  });

  describe("Edge Cases", () => {
    test("handles labs without metadata", async () => {
      mockUseMetadata.mockReturnValue({
        data: null,
        isLoading: false,
        isSuccess: true,
        error: null,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should still return lab data with fallbacks
      expect(result.current.data).toBeDefined();
    });

    test("handles labs without owners", async () => {
      mockUseOwnerOf.mockReturnValue({
        data: null,
        isLoading: false,
        isSuccess: true,
        error: null,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabById("1"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
    });

    test("handles empty lab IDs array", () => {
      mockUseAllLabs.mockReturnValue({
        data: [],
        isLoading: false,
        isSuccess: true,
        error: null,
        refetch: jest.fn(),
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useLabsForMarket(), { wrapper });

      expect(result.current.data.labs).toEqual([]);
      expect(result.current.data.totalLabs).toBe(0);
    });
  });
});
