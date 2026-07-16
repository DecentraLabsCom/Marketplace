import {
  calculateCancellationCreditReturn,
  getCancellationCreditReturnLabel,
} from '../cancellationSummary'

describe('cancellationSummary', () => {
  test('returns no credits for a pending reservation request', () => {
    expect(calculateCancellationCreditReturn({ status: 0, price: '500000' })).toBe(0n)
  })

  test('mirrors the contractual five-percent fee for confirmed bookings', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: '1000000' })).toBe(950000n)
    expect(getCancellationCreditReturnLabel({ status: 1, price: '1000000' })).toBe('9.5 credits')
  })

  test('applies the contractual minimum cancellation fee', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: '100000' })).toBe(90000n)
  })

  test('does not invent a return amount when the reservation price is unavailable', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: null })).toBeNull()
    expect(getCancellationCreditReturnLabel({ status: 1, price: null })).toMatch(/unavailable/i)
  })
})
