/**
 * @file useBookingComposedQueries.test.js
 * @description Tests for useBookingComposedQueries hooks and helpers
 */
import { calculateBookingSummary, getReservationStatusText } from './useBookingComposedQueries';

// Mock devLog to silence logs
jest.mock('@/utils/dev/logger', () => ({
  log: jest.fn(),
  moduleLoaded: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('calculateBookingSummary', () => {
  it('returns zeros for empty bookings', () => {
    const summary = calculateBookingSummary([]);
    expect(summary).toEqual({
      totalBookings: 0,
      activeBookings: 0,
      upcomingBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      pendingBookings: 0
    });
  });

  it('categorizes bookings correctly', () => {
    const now = Math.floor(Date.now() / 1000);
    const bookings = [
      { status: 1, start: now + 1000, end: now + 2000 }, // upcoming
      { status: 2, start: now - 1000, end: now + 1000 }, // active
      { status: 3, start: now - 2000, end: now - 1000 }, // completed
      { status: 5, statusCategory: 'cancelled' }, // cancelled
      { status: 0, end: now - 1000 }, // expired pending (should be filtered)
      { status: 0, end: now + 1000 }, // pending
    ];
    const summary = calculateBookingSummary(bookings);
    expect(summary.totalBookings).toBe(5); // Incluye el cancelado
    expect(summary.activeBookings).toBe(1);
    expect(summary.upcomingBookings).toBe(1);
    expect(summary.completedBookings).toBe(1);
    expect(summary.cancelledBookings).toBe(1); // ahora se incluye
    expect(summary.pendingBookings).toBe(1);
  });

  it('includes cancelled bookings if option enabled', () => {
    const bookings = [
      { status: 5, statusCategory: 'cancelled' },
      { status: 3 }
    ];
    const summary = calculateBookingSummary(bookings, { includeCancelled: true });
    expect(summary.cancelledBookings).toBe(1);
    expect(summary.completedBookings).toBe(1);
  });
});

describe('getReservationStatusText', () => {
  it('returns correct status text', () => {
    expect(getReservationStatusText(0)).toBe('Pending');
    expect(getReservationStatusText(1)).toBe('Confirmed');
    expect(getReservationStatusText(2)).toBe('In Use');
    expect(getReservationStatusText(3)).toBe('Completed');
    expect(getReservationStatusText(4)).toBe('Collected');
    expect(getReservationStatusText(5)).toBe('Cancelled');
    expect(getReservationStatusText(99)).toBe('Unknown');
  });
});

// Para los hooks principales, se recomienda mockear React Query y dependencias en tests separados.
// Aquí se cubren los helpers y lógica de categorización.
