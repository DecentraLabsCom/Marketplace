import {
  calculateCancellationCreditReturn,
  getCancellationRefundExpiryStatus,
  getCancellationPreview,
  getCancellationCreditReturnLabel,
} from '../cancellationSummary'

describe('cancellationSummary', () => {
  test('returns no credits for a pending reservation request', () => {
    expect(calculateCancellationCreditReturn({ status: 0, price: '500000' })).toBe(0n)
  })

  test('mirrors the contractual ten-percent fee for physical confirmed bookings', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: '100000000' })).toBe(90000000n)
    expect(calculateCancellationCreditReturn({ status: 1, price: '100000000', resourceType: 'lab' })).toBe(90000000n)
    expect(getCancellationCreditReturnLabel({ status: 1, price: '100000000', resourceType: 'lab' })).toBe('9 credits')
  })

  test('simulation cancellation fallback returns the full price', () => {
    expect(calculateCancellationCreditReturn({ status: 1, price: '100000000', resourceType: 'fmu' })).toBe(100000000n)
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
        totalFee: '10000000',
        providerFee: '6000000',
        refundAmount: '90000000',
        cancellationCutoff: '1893456000',
        spendingPeriodStart: '1890000000',
        spendingPeriodEnd: '1900000000',
        sourceCreditExpiry: '1905000000',
        refundDestination: '0x3333333333333333333333333333333333333333',
        policyVersion: '2',
        allocations: [],
        allocationCount: '1',
      },
    })

    expect(preview.source).toBe('on-chain')
    expect(preview.totalFeeRaw).toBe(10000000n)
    expect(preview.providerFeeRaw).toBe(6000000n)
    expect(preview.refundRaw).toBe(90000000n)
    expect(preview.minimumFeeApplied).toBe(false)
    expect(preview.allocations).toHaveLength(0)
    expect(preview.allocationCount).toBe(1)
    expect(preview.policyVersion).toBe(2)
    expect(preview.refundDestination).toBe('0x3333333333333333333333333333333333333333')
    expect(preview.sourceCreditExpiryKnown).toBe(true)
    expect(getCancellationRefundExpiryStatus(preview, 1900000000)).toBe('active')
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
    expect(preview.minimumFeeApplied).toBe(false)
    expect(preview.cancellationCutoff).toBe(1893456000)
    expect(preview.cancellable).toBe(false)
    expect(preview.policyVersion).toBeNull()
    expect(getCancellationRefundExpiryStatus(preview, 1900000000)).toBe('unknown')
  })

  test('does not treat an incomplete on-chain preview as contractual', () => {
    const preview = getCancellationPreview({
      status: 1,
      price: '10000000',
      cancellationPreview: {
        status: '1',
        cancellable: true,
        totalFee: '1000000',
        providerFee: '600000',
        refundAmount: '9000000',
        policyVersion: '2',
        sourceCreditExpiry: '1905000000',
      },
    })

    expect(preview.source).toBe('local-fallback')
    expect(preview.cancellable).toBe(false)
  })

  test('classifies an expired source lot as unavailable for confirmation', () => {
    const preview = getCancellationPreview({
      status: 1,
      price: '10000000',
      cancellationPreview: {
        status: '1',
        cancellable: true,
        refundDestination: '0x3333333333333333333333333333333333333333',
        price: '10000000',
        totalFee: '1000000',
        providerFee: '600000',
        refundAmount: '9000000',
        cancellationCutoff: '1905000000',
        spendingPeriodStart: '1890000000',
        spendingPeriodEnd: '1900000000',
        sourceCreditExpiry: '100',
        allocations: [],
        allocationCount: '1',
        policyVersion: '2',
      },
    })

    expect(getCancellationRefundExpiryStatus(preview, 101)).toBe('expired')
  })
})
