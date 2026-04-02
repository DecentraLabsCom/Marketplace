import { formatRawPricePerHour, roundDecimalString } from '@/utils/blockchain/creditUnits'

describe('creditUnits visible price formatting', () => {
  test('roundDecimalString rounds to at most one decimal', () => {
    expect(roundDecimalString('10')).toBe('10')
    expect(roundDecimalString('10.04')).toBe('10')
    expect(roundDecimalString('10.05')).toBe('10.1')
    expect(roundDecimalString('10.149')).toBe('10.1')
    expect(roundDecimalString('10.95')).toBe('11')
    expect(roundDecimalString('0.54')).toBe('0.5')
  })

  test('formatRawPricePerHour converts per-second raw price and rounds for display', () => {
    expect(formatRawPricePerHour(15n)).toBe('0.5')
    expect(formatRawPricePerHour(0n)).toBe('0')
    expect(formatRawPricePerHour(278n)).toBe('10')
  })
})