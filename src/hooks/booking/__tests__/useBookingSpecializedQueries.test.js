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
  useReservationsOfSSO: jest.fn(),
  useReservationsOfWallet: jest.fn(),
  useReservationKeyOfUserByIndexSSO: jest.fn(),
  useReservationKeyOfUserByIndexWallet: jest.fn(),
  useReservationSSO: jest.fn(),
  BOOKING_QUERY_CONFIG: { staleTime: 30000 },
}))

jest.mock('@/utils/hooks/getIsSSO', () => ({
  useGetIsSSO: jest.fn(() => true),
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
    ssoReservationKeyOfUserByIndex: jest.fn((index) => ['bookings', 'sso', 'user', 'key', index]),
    byReservationKey: jest.fn((key) => ['bookings', 'reservation', key]),
  },
}))

const mockUseReservationsOf = require('../useBookingAtomicQueries').useReservationsOf
const mockUseReservationsOfSSO = require('../useBookingAtomicQueries').useReservationsOfSSO
const mockUseReservationsOfWallet = require('../useBookingAtomicQueries').useReservationsOfWallet
const mockUseReservationKeyOfUserByIndexSSO = require('../useBookingAtomicQueries').useReservationKeyOfUserByIndexSSO
const mockUseReservationKeyOfUserByIndexWallet = require('../useBookingAtomicQueries').useReservationKeyOfUserByIndexWallet
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
    
    // Setup default mock implementations
    mockUseReservationsOf.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    
    mockUseReservationsOfSSO.mockReturnValue({
      data: { count: 0 },
      isLoading: false,
      error: null,
    })
    
    mockUseReservationsOfWallet.mockReturnValue({
      data: { count: 0 },
      isLoading: false,
      error: null,
    })
  })

  describe('useUserBookingsForMarket', () => {
    it('should initialize with user address', () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })
      
      mockUseReservationsOfWallet.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })

      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
      expect(mockUseReservationsOfSSO).toHaveBeenCalled()
    })

    it('should handle user with reservations', () => {
      // Mock reservation count
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 2 },
        isLoading: false,
        error: null,
      })
      
      mockUseReservationsOfWallet.mockReturnValue({
        data: { count: 2 },
        isLoading: false,
        error: null,
      })
      
      // Mock queryFn for reservation keys
      mockUseReservationKeyOfUserByIndexSSO.queryFn = jest.fn(() => Promise.resolve({ reservationKey: 'key1' }))
      mockUseReservationKeyOfUserByIndexWallet.queryFn = jest.fn(() => Promise.resolve({ reservationKey: 'key2' }))

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
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })
      
      mockUseReservationsOfWallet.mockReturnValue({
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
      mockUseReservationsOfSSO.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })
      
      mockUseReservationsOfWallet.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        error: null,
      })
      
      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123', { enabled: false }),
        { wrapper: createWrapper() }
      )

      expect(mockUseReservationsOfSSO).toHaveBeenCalled()
    })

    it('should handle loading state', () => {
      mockUseReservationsOfSSO.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      })
      
      mockUseReservationsOfWallet.mockReturnValue({
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
      mockUseReservationsOfSSO.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: mockError,
      })
      
      mockUseReservationsOfWallet.mockReturnValue({
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
