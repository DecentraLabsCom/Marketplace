/**
 * Tests for StakeHealthIndicator component and computeStakeHealth utility
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import StakeHealthIndicator, { computeStakeHealth } from '../StakeHealthIndicator'

// ===== computeStakeHealth unit tests =====
describe('computeStakeHealth', () => {
  test('returns "none" when required stake is zero', () => {
    const result = computeStakeHealth('1000000', '0', '0')
    expect(result.status).toBe('none')
    expect(result.label).toBe('No stake required')
    expect(result.percentage).toBe(100)
  })

  test('returns "healthy" when staked equals required', () => {
    const result = computeStakeHealth('800000000', '800000000', '0')
    expect(result.status).toBe('healthy')
    expect(result.label).toBe('Sufficient')
    expect(result.percentage).toBe(100)
  })

  test('returns "healthy" with "Well-staked" when over 150%', () => {
    // 1600 / 800 = 200%
    const result = computeStakeHealth('1600000000', '800000000', '0')
    expect(result.status).toBe('healthy')
    expect(result.label).toBe('Well-staked')
    expect(result.percentage).toBe(200)
  })

  test('returns "warning" when between 80-99% of required', () => {
    // 700 / 800 = 87.5%
    const result = computeStakeHealth('700000000', '800000000', '0')
    expect(result.status).toBe('warning')
    expect(result.label).toBe('At risk')
    expect(result.percentage).toBe(87)
  })

  test('returns "critical" when below 80% of required', () => {
    // 400 / 800 = 50%
    const result = computeStakeHealth('400000000', '800000000', '0')
    expect(result.status).toBe('critical')
    expect(result.label).toBe('Insufficient')
    expect(result.percentage).toBe(50)
  })

  test('returns "critical" with "Not staked" when zero staked', () => {
    const result = computeStakeHealth('0', '800000000', '0')
    expect(result.status).toBe('critical')
    expect(result.label).toBe('Not staked')
    expect(result.percentage).toBe(0)
  })

  test('accounts for slashed amount in effective stake', () => {
    // Staked 800, slashed 200 → effective 600 / 800 = 75% → critical
    const result = computeStakeHealth('800000000', '800000000', '200000000')
    expect(result.status).toBe('critical')
    expect(result.percentage).toBe(75)
  })

  test('handles slashed amount exceeding staked amount', () => {
    // Staked 100, slashed 200 → effective 0
    const result = computeStakeHealth('100000000', '800000000', '200000000')
    expect(result.status).toBe('critical')
    expect(result.label).toBe('Not staked')
    expect(result.percentage).toBe(0)
  })

  test('handles null/undefined inputs gracefully', () => {
    const result = computeStakeHealth(null, undefined, '')
    expect(result.status).toBe('none')
    expect(result.percentage).toBe(100)
  })

  test('handles string zero values', () => {
    const result = computeStakeHealth('0', '0', '0')
    expect(result.status).toBe('none')
  })

  test('caps percentage at 200 for display', () => {
    // 2400 / 800 = 300%, but capped at 200
    const result = computeStakeHealth('2400000000', '800000000', '0')
    expect(result.percentage).toBeLessThanOrEqual(200)
  })
})

// ===== StakeHealthIndicator rendering tests =====
describe('StakeHealthIndicator', () => {
  test('renders compact variant by default', () => {
    const { container } = render(
      <StakeHealthIndicator
        stakedAmount="800000000"
        requiredStake="800000000"
        slashedAmount="0"
      />
    )
    expect(container.querySelector('span')).toBeInTheDocument()
    expect(screen.getByText('Sufficient')).toBeInTheDocument()
  })

  test('renders full variant with progress bar', () => {
    const { container } = render(
      <StakeHealthIndicator
        stakedAmount="800000000"
        requiredStake="800000000"
        slashedAmount="0"
        variant="full"
      />
    )
    // Full variant has a progress bar div
    expect(container.querySelector('[style]')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  test('shows "Not staked" for zero stake', () => {
    render(
      <StakeHealthIndicator
        stakedAmount="0"
        requiredStake="800000000"
        slashedAmount="0"
      />
    )
    expect(screen.getByText('Not staked')).toBeInTheDocument()
  })

  test('shows "At risk" for warning state', () => {
    render(
      <StakeHealthIndicator
        stakedAmount="700000000"
        requiredStake="800000000"
        slashedAmount="0"
      />
    )
    expect(screen.getByText('At risk')).toBeInTheDocument()
  })

  test('shows "Well-staked" for high surplus', () => {
    render(
      <StakeHealthIndicator
        stakedAmount="1600000000"
        requiredStake="800000000"
        slashedAmount="0"
      />
    )
    expect(screen.getByText('Well-staked')).toBeInTheDocument()
  })
})
