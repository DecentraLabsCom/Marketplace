import {
  calculateReservationTotal,
  displayPriceToRawPerSecond,
  normalizeAllowedDurations,
  normalizeBookingMode,
  rawPerSecondToDisplayPrice,
} from '../pricingUnits'

describe('pricingUnits', () => {
  test('converts daily display price to raw per second with ceil rounding', () => {
    expect(displayPriceToRawPerSecond('25', 'day')).toBe(29n)
    expect(rawPerSecondToDisplayPrice(29n, 'day', { maxFractionDigits: 5 })).toBe('25.056')
  })

  test('converts weekly and 30-day month prices using canonical seconds', () => {
    expect(displayPriceToRawPerSecond('100', 'week')).toBe(17n)
    expect(displayPriceToRawPerSecond('300', 'month')).toBe(12n)
  })

  test('calculates reservation total from explicit start and end', () => {
    expect(calculateReservationTotal('29', 1_700_000_000, 1_700_086_400)).toBe(2_505_600n)
  })

  test('returns zero for invalid or non-positive reservation windows', () => {
    expect(calculateReservationTotal('29', 200, 200)).toBe(0n)
    expect(calculateReservationTotal('29', 300, 200)).toBe(0n)
  })

  test('normalizes legacy slot metadata into minute durations', () => {
    expect(normalizeBookingMode({ timeSlots: [15, 60] })).toBe('slot')
    expect(normalizeAllowedDurations({ timeSlots: [15, '60', 0] })).toEqual([
      { unit: 'minute', value: 15 },
      { unit: 'minute', value: 60 },
    ])
  })

  test('normalizes calendar-period metadata durations', () => {
    expect(normalizeBookingMode({ bookingMode: 'calendar_period' })).toBe('calendar-period')
    expect(normalizeAllowedDurations({
      allowedDurations: [
        { unit: 'day', value: 1 },
        { unit: 'week', value: 1 },
        { unit: 'bad', value: '2' },
      ],
    })).toEqual([
      { unit: 'day', value: 1 },
      { unit: 'week', value: 1 },
      { unit: 'minute', value: 2 },
    ])
  })
})
