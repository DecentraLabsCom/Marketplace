/**
 * Unit Tests for calendarBooking utilities
 *
 * Tests normalizeBookingForCalendar and mapBookingsForCalendar — the shared
 * normalization layer consumed by every calendar in the app (reservation page,
 * user dashboard, provider dashboard).
 *
 * Test Behaviors:
 * - normalizeBookingForCalendar: null/invalid inputs return null
 * - normalizeBookingForCalendar: Unix timestamp → ISO date derivation
 * - normalizeBookingForCalendar: status normalization via normalizeBookingStatusCode
 * - normalizeBookingForCalendar: labName resolution (string, function, booking field)
 * - normalizeBookingForCalendar: id / reservationKey fallback chain
 * - normalizeBookingForCalendar: existing date field wins over derivedDate
 * - mapBookingsForCalendar: filters nulls, handles empty / non-array inputs
 * - mapBookingsForCalendar: options forwarded to each normalizeBookingForCalendar call
 */

import {
  normalizeBookingForCalendar,
  mapBookingsForCalendar,
} from '../calendarBooking';
import { normalizeBookingStatusCode } from '@/utils/booking/bookingStatus';

jest.mock('@/utils/booking/bookingStatus', () => ({
  normalizeBookingStatusCode: jest.fn(),
}));

describe('normalizeBookingForCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: pass-through the raw numeric status
    normalizeBookingStatusCode.mockImplementation((booking) => {
      const n = Number(booking?.status);
      return Number.isFinite(n) ? n : null;
    });
  });

  test('returns null for null input', () => {
    expect(normalizeBookingForCalendar(null)).toBeNull();
  });

  test('returns null for non-object primitive', () => {
    expect(normalizeBookingForCalendar('string')).toBeNull();
    expect(normalizeBookingForCalendar(42)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(normalizeBookingForCalendar(undefined)).toBeNull();
  });

  test('derives date from Unix seconds start timestamp', () => {
    // Unix second 0 is 1970-01-01; use a known timestamp instead
    const start = 1700000000; // 2023-11-14 in UTC
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-1', start, end: start + 3600, status: 1 });
    expect(result).not.toBeNull();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // en-CA format
    // Verify it is the date corresponding to that timestamp
    const expected = new Date(start * 1000).toLocaleDateString('en-CA');
    expect(result.date).toBe(expected);
  });

  test('existing date field takes precedence over derived date', () => {
    const result = normalizeBookingForCalendar({
      reservationKey: 'rk-2',
      start: 1700000000,
      end: 1700003600,
      status: 1,
      date: '2099-01-01', // explicit future date
    });
    expect(result.date).toBe('2099-01-01');
  });

  test('dateString field is used when date is absent', () => {
    const result = normalizeBookingForCalendar({
      reservationKey: 'rk-3',
      start: 1700000000,
      end: 1700003600,
      status: 1,
      dateString: '2023-11-15',
    });
    expect(result.date).toBe('2023-11-15');
  });

  test('returns null date when start is missing', () => {
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-4', status: 1 });
    expect(result.date).toBeNull();
    expect(result.start).toBeNull();
  });

  test('normalizes numeric status via normalizeBookingStatusCode', () => {
    normalizeBookingStatusCode.mockReturnValue(3);
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-5', start: 1700000000, status: 'completed' });
    expect(normalizeBookingStatusCode).toHaveBeenCalled();
    expect(result.status).toBe(3);
  });

  test('falls back to raw status when normalizeBookingStatusCode returns null', () => {
    normalizeBookingStatusCode.mockReturnValue(null);
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-6', status: 'custom-status' });
    expect(result.status).toBe('custom-status');
  });

  test('fills id from reservationKey when id missing', () => {
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-abc', status: 1 });
    expect(result.id).toBe('rk-abc');
  });

  test('fills reservationKey from id when reservationKey missing', () => {
    const result = normalizeBookingForCalendar({ id: 'id-xyz', status: 1 });
    expect(result.reservationKey).toBe('id-xyz');
  });

  test('labName from options string wins over booking field', () => {
    const result = normalizeBookingForCalendar(
      { reservationKey: 'rk-7', labName: 'From Booking', status: 0 },
      { labName: 'From Options' }
    );
    expect(result.labName).toBe('From Options');
  });

  test('labName from options function is called with booking', () => {
    const labNameFn = jest.fn((booking) => `Computed: ${booking.labId}`);
    const result = normalizeBookingForCalendar(
      { reservationKey: 'rk-8', labId: '42', status: 0 },
      { labName: labNameFn }
    );
    expect(labNameFn).toHaveBeenCalledWith(expect.objectContaining({ labId: '42' }));
    expect(result.labName).toBe('Computed: 42');
  });

  test('labName falls back to booking.labName when no option provided', () => {
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-9', labName: 'My Lab', status: 1 });
    expect(result.labName).toBe('My Lab');
  });

  test('labName falls back to labDetails.name when labName absent', () => {
    const result = normalizeBookingForCalendar({
      reservationKey: 'rk-10',
      labDetails: { name: 'Details Lab' },
      status: 1,
    });
    expect(result.labName).toBe('Details Lab');
  });

  test('preserves all original booking fields via spread', () => {
    const booking = { reservationKey: 'rk-11', status: 1, start: 1700000000, end: 1700003600, extra: 'data' };
    const result = normalizeBookingForCalendar(booking);
    expect(result.extra).toBe('data');
  });

  test('parses start and end as numeric seconds', () => {
    const result = normalizeBookingForCalendar({
      reservationKey: 'rk-12',
      start: '1700000000',
      end: '1700003600',
      status: 1,
    });
    expect(result.start).toBe(1700000000);
    expect(result.end).toBe(1700003600);
  });

  test('sets end to null when end is missing', () => {
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-13', start: 1700000000, status: 1 });
    expect(result.end).toBeNull();
  });

  test('rejects invalid (non-positive) start values', () => {
    const result = normalizeBookingForCalendar({ reservationKey: 'rk-14', start: -1, status: 1 });
    expect(result.start).toBeNull();
    expect(result.date).toBeNull();
  });
});

describe('mapBookingsForCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    normalizeBookingStatusCode.mockImplementation((booking) => {
      const n = Number(booking?.status);
      return Number.isFinite(n) ? n : null;
    });
  });

  test('returns empty array for empty input', () => {
    expect(mapBookingsForCalendar([])).toEqual([]);
  });

  test('returns empty array for undefined input', () => {
    expect(mapBookingsForCalendar(undefined)).toEqual([]);
  });

  test('returns empty array for non-array input', () => {
    expect(mapBookingsForCalendar('not-array')).toEqual([]);
    expect(mapBookingsForCalendar(null)).toEqual([]);
  });

  test('maps a valid booking to normalized form', () => {
    const bookings = [{ reservationKey: 'rk-1', start: 1700000000, end: 1700003600, status: 1 }];
    const result = mapBookingsForCalendar(bookings);
    expect(result).toHaveLength(1);
    expect(result[0].reservationKey).toBe('rk-1');
    expect(result[0].start).toBe(1700000000);
  });

  test('filters out null entries (caused by null/invalid items)', () => {
    const bookings = [
      { reservationKey: 'rk-1', start: 1700000000, status: 1 },
      null,
      { reservationKey: 'rk-2', start: 1700007200, status: 0 },
    ];
    const result = mapBookingsForCalendar(bookings);
    expect(result).toHaveLength(2);
  });

  test('forwards labName option to each booking', () => {
    const bookings = [
      { reservationKey: 'rk-a', start: 1700000000, status: 1 },
      { reservationKey: 'rk-b', start: 1700007200, status: 0 },
    ];
    const result = mapBookingsForCalendar(bookings, { labName: 'Shared Lab' });
    expect(result[0].labName).toBe('Shared Lab');
    expect(result[1].labName).toBe('Shared Lab');
  });

  test('forwards function labName option to each booking', () => {
    const bookings = [
      { reservationKey: 'rk-c', labId: '1', start: 1700000000, status: 1 },
      { reservationKey: 'rk-d', labId: '2', start: 1700007200, status: 0 },
    ];
    const result = mapBookingsForCalendar(bookings, { labName: (b) => `Lab ${b.labId}` });
    expect(result[0].labName).toBe('Lab 1');
    expect(result[1].labName).toBe('Lab 2');
  });

  test('derives dates from start timestamps', () => {
    const start = 1700000000;
    const result = mapBookingsForCalendar([{ reservationKey: 'rk-e', start, status: 1 }]);
    expect(result[0].date).toBe(new Date(start * 1000).toLocaleDateString('en-CA'));
  });

  test('all items with invalid data are filtered out', () => {
    const bookings = [null, undefined, 'bad', 42];
    const result = mapBookingsForCalendar(bookings);
    expect(result).toEqual([]);
  });

  test('preserves ordering of input array', () => {
    const booking1 = { reservationKey: 'rk-first', start: 1700000000, status: 0 };
    const booking2 = { reservationKey: 'rk-second', start: 1700007200, status: 1 };
    const result = mapBookingsForCalendar([booking1, booking2]);
    expect(result[0].reservationKey).toBe('rk-first');
    expect(result[1].reservationKey).toBe('rk-second');
  });
});
