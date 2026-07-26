import {
  calculateCancellationCreditReturn,
  getCancellationPreview,
  getCancellationCreditReturnLabel,
} from '../cancellationSummary'

describe('cancellationSummary', () => {
  test('returns no credits for a pending reservation request', () => {
    expect(calculateCancellationCreditReturn({ status: 0, price: '500000' })).toBe(0n)
  })

  test('mirrors the contractual five-percent fee for confirmed bookings', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: '100000000' })).toBe(95000000n)
    expect(getCancellationCreditReturnLabel({ status: 1, price: '100000000' })).toBe('9.5 credits')
  })

  test('applies the contractual minimum cancellation fee', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: '10000000' })).toBe(9000000n)
  })

  test('does not invent a return amount when the reservation price is unavailable', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: null })).toBeNull()
    expect(getCancellationCreditReturnLabel({ status: 1, price: null })).toMatch(/unavailable/i)
  })

  test('prefers the on-chain cancellation preview and preserves lot provenance', () => {
    const preview = getCancellationPreview({
      status: 1,
      price: '100000000',
      cancellationPreview: {
        status: '1',
        cancellable: true,
        price: '100000000',
        totalFee: '5000000',
        providerFee: '3000000',
        refundAmount: '95000000',
        cancellationCutoff: '1893456000',
        spendingPeriodStart: '1890000000',
        spendingPeriodEnd: '1900000000',
        sourceCreditExpiry: '1905000000',
        policyVersion: '1',
        allocations: [{ fundingOrderId: '0xabc', amount: '100000000' }],
      },
    })

    expect(preview.source).toBe('on-chain')
    expect(preview.totalFeeRaw).toBe(5000000n)
    expect(preview.providerFeeRaw).toBe(3000000n)
    expect(preview.refundRaw).toBe(95000000n)
    expect(preview.minimumFeeApplied).toBe(false)
    expect(preview.allocations).toHaveLength(1)
    expect(preview.policyVersion).toBe(1)
  })

  test('provides the exact local policy fallback when legacy data lacks a preview', () => {
    const preview = getCancellationPreview({
      status: 1,
      price: '10000000',
      start: 1893456000,
    })

    expect(preview.source).toBe('local-fallback')
    expect(preview.totalFeeRaw).toBe(1000000n)
    expect(preview.providerFeeRaw).toBe(600000n)
    expect(preview.refundRaw).toBe(9000000n)
    expect(preview.minimumFeeApplied).toBe(true)
    expect(preview.cancellationCutoff).toBe(1893456000)
  })
})
