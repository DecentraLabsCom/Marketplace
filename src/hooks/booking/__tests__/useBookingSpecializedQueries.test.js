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
  useReservationsOfSSO: Object.assign(jest.fn(), { queryFn: jest.fn() }),
  useReservationsOfWallet: Object.assign(jest.fn(), { queryFn: jest.fn() }),
  useReservationKeyOfUserByIndexSSO: Object.assign(jest.fn(), { queryFn: jest.fn() }),
  useReservationKeyOfUserByIndexWallet: Object.assign(jest.fn(), { queryFn: jest.fn() }),
  useReservationSSO: Object.assign(jest.fn(), { queryFn: jest.fn() }),
  BOOKING_QUERY_CONFIG: { staleTime: 30000 },
}))

jest.mock('@/utils/hooks/authMode', () => ({
  useGetIsWallet: jest.fn(() => false),
  useGetIsSSO: jest.fn(() => true),
}))

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')

  return {
    ...actual,
    useQueries: jest.fn(() => []),
    useQuery: jest.fn(() => ({
      data: { count: 0 },
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
    })),
  }
})

jest.mock('@/utils/hooks/queryKeys', () => ({
  bookingQueryKeys: {
    reservationsOf: jest.fn((address) => ['bookings', 'reservationsOf', address]),
    ssoReservationsOf: jest.fn(() => ['bookings', 'sso', 'reservationsOf']),
    reservationKeyOfUserByIndex: jest.fn((address, index) => ['bookings', 'user', address, 'key', index]),
    ssoReservationKeyOfUserByIndex: jest.fn((index) => ['bookings', 'sso', 'user', 'key', index]),
    byReservationKey: jest.fn((key) => ['bookings', 'reservation', key]),
  },
}))

const mockUseReservationKeyOfUserByIndexSSO = require('../useBookingAtomicQueries').useReservationKeyOfUserByIndexSSO
const mockUseReservationKeyOfUserByIndexWallet = require('../useBookingAtomicQueries').useReservationKeyOfUserByIndexWallet
const mockUseQueries = require('@tanstack/react-query').useQueries
const mockUseQuery = require('@tanstack/react-query').useQuery

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

    mockUseQuery.mockReturnValue({
      data: { count: 0 },
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
    })
  })

  describe('useUserBookingsForMarket', () => {
    it('should initialize with user address', () => {
      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123'),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeDefined()
      expect(mockUseQuery).toHaveBeenCalled()
    })

    it('should handle user with reservations', () => {
      // Mock reservation count
      mockUseQuery.mockReturnValue({
        data: { count: 2 },
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        isError: false,
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
      mockUseQuery.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        isError: false,
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
      mockUseQuery.mockReturnValue({
        data: { count: 0 },
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        isError: false,
        error: null,
      })
      
      const { result } = renderHook(
        () => useUserBookingsForMarket('0x123', { enabled: false }),
        { wrapper: createWrapper() }
      )

      expect(mockUseQuery).toHaveBeenCalled()
    })

    it('should handle loading state', () => {
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: true,
        isSuccess: false,
        isError: false,
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
      mockUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        isSuccess: false,
        isError: true,
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

  // ─────────────────────────────────────────────────────────────────────────
  // useActiveUserBooking / useUserBookingSummary / useUserActiveBookings
  //
  // Shared mock helper: sets up useQuery (reservation count) and the two
  // sequential useQueries calls (reservation keys + reservation details) that
  // useUserReservationDetails makes internally.
  // ─────────────────────────────────────────────────────────────────────────

  // Fixed reference time used by all time-sensitive tests (controlled via Date.now spy)
  const NOW_UNIX_S = Math.floor(new Date('2026-01-15T12:00:00.000Z').getTime() / 1000)

  const setupReservationsMock = (reservations) => {
    mockUseQuery.mockReturnValue({
      data: { count: reservations.length },
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      error: null,
    })
    // 1st useQueries call: reservation keys
    mockUseQueries.mockReturnValueOnce(
      reservations.map((_, i) => ({ isSuccess: true, data: { reservationKey: `rk-${i}` } }))
    )
    // 2nd useQueries call: reservation details
    mockUseQueries.mockReturnValueOnce(
      reservations.map((r, i) => ({
        isSuccess: true,
        data: { reservationKey: `rk-${i}`, reservation: r },
      }))
    )
  }

  describe('useActiveUserBooking', () => {
    let dateSpy

    beforeEach(() => {
      dateSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_UNIX_S * 1000)
    })

    afterEach(() => {
      dateSpy.mockRestore()
    })

    it('returns null activeBooking and nextBooking when no reservations', () => {
      setupReservationsMock([])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toBeNull()
      expect(result.current.data.nextBooking).toBeNull()
      expect(result.current.data.hasActiveBooking).toBe(false)
      expect(result.current.data.hasUpcomingBooking).toBe(false)
    })

    it('identifies an active confirmed booking (status 1, now within window)', () => {
      setupReservationsMock([
        { labId: '1', status: 1, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.hasActiveBooking).toBe(true)
      expect(result.current.data.activeBooking).toMatchObject({ reservationKey: 'rk-0', labId: '1' })
      expect(result.current.data.nextBooking).toBeNull()
    })

    it('identifies a pending upcoming booking as nextBooking (status 0)', () => {
      setupReservationsMock([
        { labId: '2', status: 0, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toBeNull()
      expect(result.current.data.hasUpcomingBooking).toBe(true)
      expect(result.current.data.nextBooking).toMatchObject({ reservationKey: 'rk-0', labId: '2' })
    })

    it('identifies a confirmed upcoming booking as nextBooking (status 1)', () => {
      setupReservationsMock([
        { labId: '3', status: 1, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toBeNull()
      expect(result.current.data.nextBooking).toMatchObject({ labId: '3' })
    })

    it('picks the earliest upcoming booking when multiple exist', () => {
      setupReservationsMock([
        { labId: 'later', status: 1, start: NOW_UNIX_S + 7200, end: NOW_UNIX_S + 10800 },
        { labId: 'earlier', status: 1, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.nextBooking).toMatchObject({ labId: 'earlier' })
    })

    it('does not treat status-2 (in_use) booking as active', () => {
      // Implementation only checks status === 1 for active
      setupReservationsMock([
        { labId: '5', status: 2, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toBeNull()
    })

    it('does not include cancelled (status 5) booking as next', () => {
      setupReservationsMock([
        { labId: '6', status: 5, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.nextBooking).toBeNull()
    })

    it('does not include a booking that has already ended', () => {
      setupReservationsMock([
        { labId: '7', status: 1, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toBeNull()
      expect(result.current.data.nextBooking).toBeNull()
    })

    it('active booking takes precedence — nextBooking is null when active found', () => {
      setupReservationsMock([
        { labId: 'active', status: 1, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },
        { labId: 'upcoming', status: 1, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useActiveUserBooking('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toMatchObject({ labId: 'active' })
      expect(result.current.data.nextBooking).toBeNull()
    })
  })

  describe('useUserBookingSummary', () => {
    let dateSpy

    beforeEach(() => {
      dateSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_UNIX_S * 1000)
    })

    afterEach(() => {
      dateSpy.mockRestore()
    })

    it('returns all-zero summary when no reservations', () => {
      setupReservationsMock([])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data).toMatchObject({
        totalBookings: 0,
        activeBookings: 0,
        upcomingBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        pendingBookings: 0,
      })
    })

    it('counts a pending booking (status 0)', () => {
      setupReservationsMock([
        { labId: '1', status: 0, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.pendingBookings).toBe(1)
      expect(result.current.data.totalBookings).toBe(1)
    })

    it('counts a cancelled booking (status 5)', () => {
      setupReservationsMock([
        { labId: '1', status: 5, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.cancelledBookings).toBe(1)
    })

    it('counts an active confirmed booking (status 1, now within window) as activeBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 1, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBookings).toBe(1)
    })

    it('counts a confirmed future booking (status 1, start > now) as upcomingBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 1, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.upcomingBookings).toBe(1)
    })

    it('counts a confirmed past booking (status 1, end < now) as completedBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 1, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.completedBookings).toBe(1)
    })

    it('counts status-3 (completed) booking directly as completedBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 3, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.completedBookings).toBe(1)
    })

    it('counts status-4 (collected) booking as completedBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 4, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.completedBookings).toBe(1)
    })

    it('counts in_use (status 2) booking within window as activeBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 2, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBookings).toBe(1)
    })

    it('counts in_use (status 2) future booking as upcomingBookings', () => {
      setupReservationsMock([
        { labId: '1', status: 2, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.upcomingBookings).toBe(1)
    })

    it('produces correct totals across mixed booking statuses', () => {
      setupReservationsMock([
        { labId: '1', status: 0, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },   // pending
        { labId: '2', status: 1, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },   // active
        { labId: '3', status: 1, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },   // upcoming
        { labId: '4', status: 3, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },   // completed
        { labId: '5', status: 5, start: NOW_UNIX_S - 7200, end: NOW_UNIX_S - 3600 },   // cancelled
      ])
      const { result } = renderHook(() => useUserBookingSummary('0x123'), { wrapper: createWrapper() })
      expect(result.current.data).toMatchObject({
        totalBookings: 5,
        pendingBookings: 1,
        activeBookings: 1,
        upcomingBookings: 1,
        completedBookings: 1,
        cancelledBookings: 1,
      })
    })
  })

  describe('useUserActiveBookings', () => {
    let dateSpy

    beforeEach(() => {
      dateSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_UNIX_S * 1000)
    })

    afterEach(() => {
      dateSpy.mockRestore()
    })

    it('returns null activeBooking and nextBooking when no reservations', () => {
      setupReservationsMock([])
      const { result } = renderHook(() => useUserActiveBookings('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.activeBooking).toBeNull()
      expect(result.current.data.nextBooking).toBeNull()
      expect(result.current.data.hasActiveBooking).toBe(false)
    })

    it('returns activeBooking with start/end/date when confirmed booking is now active', () => {
      setupReservationsMock([
        { labId: '10', status: 1, start: NOW_UNIX_S - 1800, end: NOW_UNIX_S + 1800 },
      ])
      const { result } = renderHook(() => useUserActiveBookings('0x123'), { wrapper: createWrapper() })
      const { activeBooking } = result.current.data
      expect(activeBooking).not.toBeNull()
      expect(activeBooking.labId).toBe('10')
      expect(activeBooking.start).toBe(NOW_UNIX_S - 1800)
      expect(activeBooking.end).toBe(NOW_UNIX_S + 1800)
      expect(activeBooking.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.current.data.nextBooking).toBeNull()
    })

    it('returns nextBooking with date when no active booking but upcoming exists', () => {
      setupReservationsMock([
        { labId: '11', status: 0, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useUserActiveBookings('0x123'), { wrapper: createWrapper() })
      const { nextBooking } = result.current.data
      expect(nextBooking).not.toBeNull()
      expect(nextBooking.labId).toBe('11')
      expect(nextBooking.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.current.data.activeBooking).toBeNull()
    })

    it('picks the earliest upcoming when multiple pending exist', () => {
      setupReservationsMock([
        { labId: 'far', status: 0, start: NOW_UNIX_S + 7200, end: NOW_UNIX_S + 10800 },
        { labId: 'near', status: 0, start: NOW_UNIX_S + 3600, end: NOW_UNIX_S + 7200 },
      ])
      const { result } = renderHook(() => useUserActiveBookings('0x123'), { wrapper: createWrapper() })
      expect(result.current.data.nextBooking?.labId).toBe('near')
    })
  })
})
