import {
  calculateBookingSummary,
  getReservationStatusText,
} from '../dashboardSummary'

describe('dashboardSummary', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('returns empty counters when no bookings are provided', () => {
    expect(calculateBookingSummary()).toEqual({
      totalBookings: 0,
      activeBookings: 0,
      upcomingBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      pendingBookings: 0,
    })
  })

  test('classifies bookings into stable dashboard buckets', () => {
    const now = Math.floor(Date.now() / 1000)

    const summary = calculateBookingSummary([
      { status: 2, start: now - 60, end: now + 60 },
      { status: 1, start: now + 600, end: now + 1200 },
      { status: 3, start: now - 1200, end: now - 600 },
      { status: 0, start: now + 60, end: now + 120 },
    ])

    expect(summary).toEqual({
      totalBookings: 4,
      activeBookings: 1,
      upcomingBookings: 1,
      completedBookings: 1,
      cancelledBookings: 0,
      pendingBookings: 1,
    })
  })

  test('filters cancelled, rejected and expired pending bookings from totals', () => {
    const now = Math.floor(Date.now() / 1000)

    const summary = calculateBookingSummary([
      { status: 5, start: now - 120, end: now - 60 },
      { status: 1, intentStatus: 'REJECTED', start: now + 60, end: now + 120 },
      { status: 0, start: now - 600, end: now - 300 },
      { status: 4, start: now - 200, end: now - 100 },
    ])

    expect(summary).toEqual({
      totalBookings: 1,
      activeBookings: 0,
      upcomingBookings: 0,
      completedBookings: 1,
      cancelledBookings: 0,
      pendingBookings: 0,
    })
  })

  test('maps reservation status numbers to display labels', () => {
    expect(getReservationStatusText(0)).toBe('Pending')
    expect(getReservationStatusText(1)).toBe('Confirmed')
    expect(getReservationStatusText(2)).toBe('In Use')
    expect(getReservationStatusText(3)).toBe('Completed')
    expect(getReservationStatusText(4)).toBe('Settled')
    expect(getReservationStatusText(5)).toBe('Cancelled')
    expect(getReservationStatusText(99)).toBe('Unknown')
  })
})
