/**
 * Unit Tests for useLabWallet (Wallet variant of atomic lab queries)
 *
 * - Happy path: devuelve datos normalizados correctamente para un labId válido
 * - Error: propaga error si el contrato falla
 * - labId inválido: no ejecuta la query
 */

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLabWallet } from "@/hooks/lab/useLabAtomicQueries";

// Mock useDefaultReadContract
jest.mock("@/hooks/contract/useDefaultReadContract", () => ({
  __esModule: true,
  default: jest.fn(),
}));
const useDefaultReadContract = require("@/hooks/contract/useDefaultReadContract").default;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useLabWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("happy path: devuelve datos normalizados para labId válido", async () => {
    const labId = 1;
    // Simula el valor crudo del contrato (sin normalizar)
    useDefaultReadContract.mockImplementation((fn, args, opts) => {
      const raw = {
        labId,
        base: {
          uri: "ipfs://test",
          price: 1000000000000000000n,
          accessURI: "",
          accessKey: "",
          createdAt: 1234567890,
        },
      };
      return {
        data: opts && typeof opts.select === 'function' ? opts.select(raw) : raw,
        isSuccess: true,
        isLoading: false,
        error: null,
      };
    });

    const { result } = renderHook(() => useLabWallet(labId), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toEqual({
      labId: 1,
      base: {
        uri: "ipfs://test",
        price: "1000000000000000000",
        priceNumber: 1000000000000000000,
        accessURI: "",
        accessKey: "",
        createdAt: 1234567890,
      },
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("propaga error si el contrato falla", () => {
    const labId = 1;
    useDefaultReadContract.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isLoading: false,
      error: new Error("Contract error"),
    });

    const { result } = renderHook(() => useLabWallet(labId), {
      wrapper: createWrapper(),
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe("Contract error");
  });

  it("no ejecuta la query si labId es inválido", () => {
    useDefaultReadContract.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLabWallet(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
