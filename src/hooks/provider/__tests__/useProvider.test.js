/**
 * Unit Tests for Provider Mutation Hooks
 *
 * Tests mutation hooks for provider operations including lab data management,
 * file uploads/moves/deletes, and provider registration. Validates API calls,
 * cache invalidation strategies, and error handling.
 *
 * Tests Behaviors:
 * - Mutation execution and success callbacks
 * - API request validation (headers, body, method)
 * - Cache invalidation patterns (remove, invalidate, refetch)
 * - Error handling and validation
 * - Edge cases (missing fields, malformed responses)
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useSaveLabData,
  useSaveProviderRegistration,
  useUploadFile,
  useMoveFiles,
  useDeleteFile,
  useDeleteLabData,
} from "../useProvider";
import { metadataQueryKeys } from "@/utils/hooks/queryKeys";

// Mock external dependencies
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

// Helper to create fresh QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Helper to create wrapper with QueryClientProvider
const createWrapper = (queryClient) => {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("Provider Mutation Hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    jest.spyOn(Date, "now").mockReturnValue(1234567890);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("useSaveLabData", () => {
    test("returns mutation in idle state initially", () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveLabData(), {
        wrapper: createWrapper(queryClient),
      });

      expect(result.current.isPending).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(typeof result.current.mutate).toBe("function");
    });

    test("saves lab data with timestamp and cache headers", async () => {
      const mockLabData = { uri: "lab-123", name: "Test Lab" };
      const mockResponse = { success: true, id: "lab-123" };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate(mockLabData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith("/api/provider/saveLabData", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
        body: JSON.stringify({ labData: mockLabData, timestamp: 1234567890 }),
      });

      expect(result.current.data).toEqual({
        ...mockResponse,
        timestamp: 1234567890,
      });
    });

    test("removes old cache and invalidates queries on success", async () => {
      const mockLabData = { uri: "lab-456", name: "Another Lab" };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const queryClient = createTestQueryClient();
      const removeQueriesSpy = jest.spyOn(queryClient, "removeQueries");
      const invalidateQueriesSpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useSaveLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate(mockLabData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(removeQueriesSpy).toHaveBeenCalledWith({
        queryKey: metadataQueryKeys.byUri("lab-456"),
        exact: true,
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: metadataQueryKeys.byUri("lab-456"),
        exact: true,
        refetchType: "all",
      });
    });

    test("calls custom onSuccess callback when provided", async () => {
      const mockLabData = { uri: "lab-789", name: "Custom Lab" };
      const customOnSuccess = jest.fn();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(
        () => useSaveLabData({ onSuccess: customOnSuccess }),
        {
          wrapper: createWrapper(queryClient),
        }
      );

      result.current.mutate(mockLabData);

      await waitFor(() => expect(customOnSuccess).toHaveBeenCalled());

      expect(customOnSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, timestamp: 1234567890 }),
        mockLabData,
        undefined,
        expect.anything() // Mutation context (client, meta, mutationKey)
      );
    });

    test("throws error when lab data is null", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate(null);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(new Error("Lab data is required"));
    });

    test("handles API error responses", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Database connection failed" }),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({ uri: "lab-error" });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Database connection failed");
    });

    test("handles network errors", async () => {
      global.fetch.mockRejectedValueOnce(new Error("Network request failed"));

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({ uri: "lab-network" });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Network request failed");
    });
  });

  describe("useSaveProviderRegistration", () => {
    test("saves provider registration successfully", async () => {
      const mockProviderData = {
        name: "Provider Inc",
        email: "contact@provider.com",
      };
      const mockResponse = { success: true, id: "provider-123" };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveProviderRegistration(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate(mockProviderData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/provider/saveRegistration",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mockProviderData),
        }
      );

      expect(result.current.data).toEqual(mockResponse);
    });

    test("throws error when provider data is null", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useSaveProviderRegistration(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate(null);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(
        new Error("Provider data is required")
      );
    });
  });

  describe("useUploadFile", () => {
    test("uploads file with FormData successfully", async () => {
      const mockFile = new File(["content"], "test.pdf", {
        type: "application/pdf",
      });
      const mockResponse = { success: true, filePath: "/uploads/test.pdf" };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUploadFile(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        file: mockFile,
        destinationFolder: "/temp",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/provider/uploadFile",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );

      expect(result.current.data).toEqual(mockResponse);
    });

    test("includes labId in FormData when provided", async () => {
      const mockFile = new File(["content"], "lab-file.pdf");
      const mockResponse = {
        success: true,
        filePath: "/uploads/lab-123/lab-file.pdf",
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUploadFile(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        file: mockFile,
        destinationFolder: "/labs",
        labId: "lab-123",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const callArgs = global.fetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get("labId")).toBe("lab-123");
    });

    test("throws error when required fields are missing", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useUploadFile(), {
        wrapper: createWrapper(queryClient),
      });

      // Test missing file
      result.current.mutate({
        file: null,
        destinationFolder: "/temp",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe("File is required");
    });
  });

  describe("useMoveFiles", () => {
    test("moves files to lab folder successfully", async () => {
      const mockFilePaths = ["/temp/file1.pdf", "/temp/file2.pdf"];
      const mockResponse = {
        success: true,
        movedFiles: ["/labs/lab-123/file1.pdf", "/labs/lab-123/file2.pdf"],
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useMoveFiles(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        filePaths: mockFilePaths,
        labId: "lab-123",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith("/api/provider/moveFiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePaths: mockFilePaths, labId: "lab-123" }),
      });
    });

    test("throws error when filePaths is not an array", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useMoveFiles(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        filePaths: null,
        labId: "lab-123",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe(
        "File paths array is required"
      );
    });

    test("throws error when labId is missing", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useMoveFiles(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        filePaths: ["/temp/file.pdf"],
        labId: null,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Lab ID is required");
    });
  });

  describe("useDeleteFile", () => {
    test("deletes file with FormData successfully", async () => {
      const mockResponse = { success: true, message: "File deleted" };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDeleteFile(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        filePath: "/uploads/test.pdf",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/provider/deleteFile",
        expect.objectContaining({
          method: "POST",
          body: expect.any(FormData),
        })
      );
    });

    test("includes deletingLab flag when provided", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDeleteFile(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        filePath: "/labs/lab-123/file.pdf",
        deletingLab: true,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const callArgs = global.fetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get("deletingLab")).toBe("true");
    });

    test("throws error when file path is missing", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDeleteFile(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        filePath: null,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("File path is required");
    });
  });

  describe("useDeleteLabData", () => {
    test("deletes lab data successfully", async () => {
      const mockResponse = { success: true, message: "Lab deleted" };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDeleteLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate("lab-to-delete");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(global.fetch).toHaveBeenCalledWith("/api/provider/deleteLabData", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labURI: "lab-to-delete" }),
      });
    });

    test("invalidates all metadata queries on success", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const queryClient = createTestQueryClient();
      const invalidateQueriesSpy = jest.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useDeleteLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate("lab-999");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: metadataQueryKeys.all(),
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: metadataQueryKeys.byUri("lab-999"),
      });
    });

    test("throws error when lab URI is missing", async () => {
      const queryClient = createTestQueryClient();
      const { result } = renderHook(() => useDeleteLabData(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate(null);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe("Lab URI is required");
    });
  });
});
