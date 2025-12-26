/**
 * Tests for useBookingSpecializedQueries hook
 *
 * @group hooks
 * @group booking
 */

import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useUserBookingsForMarket,
  useBookingsForCalendar,
  useActiveUserBooking,
  useUserBookingSummary,
  useUserActiveBookings,
} from '../useBookingSpecializedQueries'

// Mock dependencies
jest.mock('../useBookingAtomicQueries', () => ({
  useReservationsOf: jest.fn(),
  useReservationKeyOfUserByIndexSSO: jest.fn(),
  useReservationSSO: jest.fn(),
  BOOKING_QUERY_CONFIG: { staleTime: 30000 },
}))

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')

  return {
    ...actual,
    useQueries: jest.fn(() => []),
  }
})

jest.mock('@/utils/hooks/queryKeys', () => ({
  bookingQueryKeys: {
    reservationKeyOfUserByIndex: jest.fn((address, index) => ['bookings', 'user', address, 'key', index]),
    byReservationKey: jest.fn((key) => ['bookings', 'reservation', key]),
  },
}))

const mockUseReservationsOf = require('../useBookingAtomicQueries').useReservationsOf
const mockUseReservationKeyOfUserByIndexSSO = require('../useBookingAtomicQueries').useReservationKeyOfUserByIndexSSO
const mockUseReservationSSO = require('../useBookingAtomicQueries').useReservationSSO
const mockUseQueries = require('@tanstack/react-query').useQueries

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useBookingSpecializedQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('useUserBookingsForMarket', () => {
    it('should initialize with user address', () => {
      mockUseReservationsOf.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })

      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
      expect(mockUseReservationsOf).toHaveBeenCalledWith('0x123', expect.objectContaining({
        isSSO: true, // Should force SSO mode
        enabled: true,
      }))
    })

    it('should handle user with reservations', () => {
      // Mock reservation count
      mockUseReservationsOf.mockReturnValue({
        data: { count: 2 },
        isLoading: false,
        error: null,
      })

      // Mock useQueries for reservation keys
      mockUseQueries.mockReturnValueOnce([
        { isSuccess: true, data: { reservationKey: 'key1' } },
        { isSuccess: true, data: { reservationKey: 'key2' } }
      ])

      // Mock useQueries for booking details
      mockUseQueries.mockReturnValueOnce([
        { 
          isSuccess: true, 
          data: { 
            reservation: { 
              start: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
              end: Math.floor(Date.now() / 1000) + 3600,   // 1 hour from now
              status: 1, // active
              labId: 'lab1'
            } 
          } 
        },
        { 
          isSuccess: true, 
          data: { 
            reservation: { 
              start: Math.floor(Date.now() / 1000) - 3600,
              end: Math.floor(Date.now() / 1000) + 3600,
              status: 2, // confirmed
              labId: 'lab2'
            } 
          } 
        }
      ])

      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current.data.activeBookingsCount).toBe(2)
      expect(result.current.data.userLabsWithActiveBookings.size).toBe(2)
    })

    it('should handle zero reservations', () => {
      mockUseReservationsOf.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })

      // No need to mock useQueries since count is 0

      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current.data.activeBookingsCount).toBe(0)
      expect(result.current.data.userLabsWithActiveBookings.size).toBe(0)
    })

    it('should respect enabled option', () => {
      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123', { enabled: false }),
        { wrapper: createWrapper() }
      )

      expect(mockUseReservationsOf).toHaveBeenCalledWith('0x123', expect.objectContaining({
        enabled: false,
      }))
    })

    it('should handle loading state', () => {
      mockUseReservationsOf.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      })

      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
    })

    it('should handle error state', () => {
      const mockError = new Error('Failed to fetch reservations')
      mockUseReservationsOf.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: mockError,
      })

      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(false)
      expect(result.current.data.activeBookingsCount).toBe(0)
    })
  })

  describe('useBookingsForCalendar', () => {
    it('should initialize correctly', () => {
      const { result } = renderHook(
        () => useBookingsForCalendar('0x123', 'lab456'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
    })
  })

  describe('useActiveUserBooking', () => {
    it('should initialize correctly', () => {
      const { result } = renderHook(
        () => useActiveUserBooking('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
    })
  })

  describe('useUserBookingSummary', () => {
    it('should initialize correctly', () => {
      const { result } = renderHook(
        () => useUserBookingSummary('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
    })
  })

  describe('useUserActiveBookings', () => {
    it('should initialize correctly', () => {
      const { result } = renderHook(
        () => useUserActiveBookings('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
    })
  })
})
