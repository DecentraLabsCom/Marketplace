
/**
 * Unit Tests for useLabBalanceWallet (Wallet variant)
 *
 * - Happy path: devuelve balance normalizado para un ownerAddress válido
 * - Error: propaga error si el contrato falla
 * - ownerAddress inválido: no ejecuta la query
 */

import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLabBalanceWallet } from "@/hooks/lab/useLabAtomicQueries";

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

describe("useLabBalanceWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("happy path: devuelve balance normalizado para ownerAddress válido", () => {
    const ownerAddress = "0x1234567890123456789012345678901234567890";
    // Simula el valor crudo del contrato (sin normalizar)
    useDefaultReadContract.mockImplementation((fn, args, opts) => {
      const raw = { balance: 3n };
      return {
        data: opts && typeof opts.select === 'function' ? opts.select(raw) : raw,
        isSuccess: true,
        isLoading: false,
        error: null,
      };
    });

    const { result } = renderHook(() => useLabBalanceWallet(ownerAddress), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toEqual({ balance: "3" });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("propaga error si el contrato falla", () => {
    const ownerAddress = "0x1234567890123456789012345678901234567890";
    useDefaultReadContract.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isLoading: false,
      error: new Error("Contract error"),
    });

    const { result } = renderHook(() => useLabBalanceWallet(ownerAddress), {
      wrapper: createWrapper(),
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe("Contract error");
  });

  it("no ejecuta la query si ownerAddress es inválido", () => {
    useDefaultReadContract.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useLabBalanceWallet(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
