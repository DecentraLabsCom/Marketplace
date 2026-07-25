import { formatRawPricePerHour, roundDecimalString } from '@/utils/blockchain/creditUnits'

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
    expect(formatRawPricePerHour(15n)).toBe('0.54')
    expect(formatRawPricePerHour(0n)).toBe('0')
    expect(formatRawPricePerHour(23n)).toBe('0.828')
    expect(formatRawPricePerHour(278n)).toBe('10.008')
  })
})
