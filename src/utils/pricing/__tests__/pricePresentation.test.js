import {
  formatPricePerUnit,
  getLabPricingUnit,
} from '../pricePresentation'

describe('pricePresentation', () => {
  test('resolves the display unit from lab pricing metadata', () => {
    expect(getLabPricingUnit({ pricing: { displayUnit: 'day' } })).toBe('day')
    expect(getLabPricingUnit({ priceUnit: 'week' })).toBe('week')
    expect(getLabPricingUnit({ pricing: { displayUnit: 'unknown' } })).toBe('hour')
  })

  test('formats a non-hourly price with its unit', () => {
    const formatPrice = jest.fn(() => '25.00')

    expect(formatPricePerUnit({
      price: '100',
      lab: { pricing: { displayUnit: 'day' } },
      formatPrice,
    })).toEqual({
      amount: '25.00',
      unit: 'day',
      isFree: false,
      text: '25.00 credits / day',
    })
    expect(formatPrice).toHaveBeenCalledWith('100', 'day')
  })

  test.each(['hour', 'day', 'week', 'month'])('formats %s prices with the matching unit', (unit) => {
    const formatPrice = jest.fn(() => '10.00')

    expect(formatPricePerUnit({
      price: '100',
      unit,
      formatPrice,
    }).text).toBe(`10.00 credits / ${unit}`)
    expect(formatPrice).toHaveBeenCalledWith('100', unit)
  })

  test('presents zero-priced labs as free', () => {
    const formatPrice = jest.fn()

    expect(formatPricePerUnit({
      price: '0',
      unit: 'month',
      formatPrice,
    })).toEqual({
      amount: 'Free',
      unit: 'month',
      isFree: true,
      text: 'Free',
    })
    expect(formatPrice).not.toHaveBeenCalled()
  })
})
