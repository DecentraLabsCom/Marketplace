import { formatRawCredits, formatRawPricePerHour, roundDecimalString } from '@/utils/blockchain/creditUnits'

describe('creditUnits visible price formatting', () => {
  test('roundDecimalString rounds to at most three decimals by default', () => {
    expect(roundDecimalString('10')).toBe('10')
    expect(roundDecimalString('10.0004')).toBe('10')
    expect(roundDecimalString('10.0005')).toBe('10.001')
    expect(roundDecimalString('10.1499')).toBe('10.15')
    expect(roundDecimalString('10.9995')).toBe('11')
    expect(roundDecimalString('0.54')).toBe('0.54')
  })

  test('formatRawPricePerHour converts per-second raw price and rounds for display', () => {
    expect(formatRawCredits(10_000_000n)).toBe('1')
    expect(formatRawPricePerHour(1_500n)).toBe('0.54')
    expect(formatRawPricePerHour(0n)).toBe('0')
    expect(formatRawPricePerHour(2_300n)).toBe('0.828')
    expect(formatRawPricePerHour(27_800n)).toBe('10.008')
    expect(formatRawPricePerHour(2_222n, 7)).toBe('0.8')
  })
})
