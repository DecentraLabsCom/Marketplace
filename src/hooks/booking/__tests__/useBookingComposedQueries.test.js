/**
 * Unit Tests for Booking Composed Hooks
 *
 * Tests the user and provider booking dashboard hooks.
 *
 * Covers institutional data loading and provider booking aggregation.
 */

import {
  useUserBookingsDashboard,
  useLabBookingsDashboard,
} from "../useBookingComposedQueries";

// Testing library imports
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock logger
jest.mock("@/utils/dev/logger", () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}));

jest.mock("@/utils/hooks/useProviderMapping", () => ({
  useProviderMapping: jest.fn(() => ({})),
}));

jest.mock("@/hooks/lab/useLabAtomicQueries", () => ({
  useAllLabs: jest.fn(() => ({ data: [1], isLoading: false })),
  useAllLabsSSO: jest.fn(() => ({ data: [1], isLoading: false })),
  useLabSSO: jest.fn(() => ({ data: null, isLoading: false })),
  useLabOwnerSSO: jest.fn(() => ({ data: null, isLoading: false })),
  useLab: jest.fn(() => ({ data: null, isLoading: false })),
  LAB_QUERY_CONFIG: {},
}));

jest.mock("@/hooks/metadata/useMetadata", () => ({
  useMetadata: jest.fn(() => ({ data: null, isLoading: false })),
  METADATA_QUERY_CONFIG: {},
}));

jest.mock("../useBookingAtomicQueries", () => ({
  useReservationsOfSSO: jest.fn(),
  useReservationSSO: { queryFn: jest.fn() },
  useReservationsOfToken: jest.fn(),
  useReservationOfTokenByIndexSSO: { queryFn: jest.fn() },
  useReservationKeyOfUserByIndexSSO: { queryFn: jest.fn() },
  useReservation: { queryFn: jest.fn() },
  BOOKING_QUERY_CONFIG: {},
}));

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");

  return {
    ...actual,
    useQueries: jest.fn(() => []),
    useQueryClient: jest.fn(() => ({
      getQueryData: jest.fn(() => []),
    })),
  };
});

const mockUseReservationsOfSSO = require("../useBookingAtomicQueries").useReservationsOfSSO;
const mockUseReservationsOfToken = require("../useBookingAtomicQueries").useReservationsOfToken;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("Booking Composed Hooks - Dashboards", () => {
  describe("useUserBookingsDashboard", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });
    });

    test("initializes with default options", () => {
      const { result } = renderHook(() => useUserBookingsDashboard(), { wrapper: createWrapper() });

      expect(result.current).toBeDefined();
      expect(mockUseReservationsOfSSO).toHaveBeenCalled();
    });

    test("handles user with reservations", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 2 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() => useUserBookingsDashboard(), { wrapper: createWrapper() });

      expect(result.current.data.summary.totalBookings).toBe(2);
      expect(result.current.meta.reservationCount).toBe(2);
    });

    test("applies limit when specified", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 10 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() =>
        useUserBookingsDashboard({ limit: 5 }),
        { wrapper: createWrapper() }
      );

      expect(result.current.meta.reservationCount).toBe(5);
      expect(result.current.data.summary.totalBookings).toBe(10);
    });

    test("handles zero reservations", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() => useUserBookingsDashboard(), { wrapper: createWrapper() });

      expect(result.current.data.summary.totalBookings).toBe(0);
      expect(result.current.meta.reservationCount).toBe(0);
    });

    test("handles loading state", () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: undefined,
        isLoading: true,
        isSuccess: false,
        error: null,
      });

      const { result } = renderHook(() => useUserBookingsDashboard(), { wrapper: createWrapper() });

      expect(result.current.isLoading).toBe(true);
    });

    test("handles error state", () => {
      const mockError = new Error("Failed to fetch reservations");
      mockUseReservationsOfSSO.mockReturnValue({
        data: undefined,
        isLoading: false,
        isSuccess: false,
        error: mockError,
      });

      const { result } = renderHook(() => useUserBookingsDashboard(), { wrapper: createWrapper() });

      expect(result.current.error).toBe(mockError);
    });
  });

  describe("useLabBookingsDashboard", () => {
    test("initializes correctly", () => {
      mockUseReservationsOfToken.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isSuccess: true,
        error: null,
      });

      const { result } = renderHook(() => useLabBookingsDashboard("lab123"), { wrapper: createWrapper() });

      expect(result.current).toBeDefined();
    });
  });
});
