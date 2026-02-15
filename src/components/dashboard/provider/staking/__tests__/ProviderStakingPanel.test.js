import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock dependent hooks/components
jest.mock('@/hooks/staking/useStakingAtomicQueries', () => ({
  useStakeInfo: () => ({ data: { stakedAmount: '1000000', slashedAmount: '0', canUnstake: true, unlockTimestamp: 0 }, isLoading: false, isError: false }),
  useRequiredStake: () => ({ data: { requiredStake: '800000' }, isLoading: false }),
}))

jest.mock('@/hooks/staking/useStakingAtomicMutations', () => ({
  useStakeTokens: () => ({ mutateAsync: jest.fn().mockResolvedValue({ success: true }) }),
  useUnstakeTokens: () => ({ mutateAsync: jest.fn().mockResolvedValue({ success: true }) }),
}))

jest.mock('@/context/LabTokenContext', () => ({ useLabToken: () => ({ decimals: 6 }) }))
jest.mock('../StakeHealthIndicator', () => {
  const actual = jest.requireActual('../StakeHealthIndicator')
  return { __esModule: true, default: () => <div data-testid="mock-stake-health" />, computeStakeHealth: actual.computeStakeHealth }
})

import ProviderStakingPanel from '../ProviderStakingPanel'

describe('ProviderStakingPanel', () => {
  test('Stake and Unstake buttons have equal fixed width', () => {
    const { container } = render(<ProviderStakingPanel providerAddress="0xabc" isSSO={false} labCount={2} onNotify={() => {}} />)

    const stakeBtn = screen.getByRole('button', { name: /^Stake$/i })
    const unstakeBtn = screen.getByRole('button', { name: /^Unstake$/i })

    // both buttons should include the width utility we added
    expect(stakeBtn.className).toMatch(/w-32/)
    expect(unstakeBtn.className).toMatch(/w-32/)

    // stronger horizontal padding reduction applied to panel container
    const panel = container.querySelector('[data-testid="staking-panel"]')
    expect(panel?.className || '').toMatch(/px-3/)
  })

  test('Stake button is disabled when input is empty and becomes enabled when value entered', () => {
    render(<ProviderStakingPanel providerAddress="0xabc" isSSO={false} labCount={2} onNotify={() => {}} />)

    const stakeBtn = screen.getByRole('button', { name: /^Stake$/i })
    const input = screen.getByPlaceholderText(/Amount to stake/i)

    expect(stakeBtn).toBeDisabled()
    fireEvent.change(input, { target: { value: '100' } })
    expect(screen.getByRole('button', { name: /^Stake$/i })).not.toBeDisabled()
  })

  test('when no stake is required only the full indicator is rendered (compact suppressed)', () => {
    const stakingModule = require('@/hooks/staking/useStakingAtomicQueries')
    stakingModule.useStakeInfo = jest.fn(() => ({ data: { stakedAmount: '0', slashedAmount: '0', canUnstake: false, unlockTimestamp: 0 }, isLoading: false, isError: false }))
    stakingModule.useRequiredStake = jest.fn(() => ({ data: { requiredStake: '0' }, isLoading: false }))

    const { container } = render(<ProviderStakingPanel providerAddress="0xabc" isSSO={false} labCount={0} onNotify={() => {}} />)

    // The mocked StakeHealthIndicator renders a single element with data-testid="mock-stake-health".
    // After the change, header (compact) should not include it, but the full indicator should still render.
    const allMocks = container.querySelectorAll('[data-testid="mock-stake-health"]')
    expect(allMocks.length).toBe(1)

    const header = screen.getByRole('heading', { name: /Staking/i }).closest('div')
    expect(header?.querySelector('[data-testid="mock-stake-health"]')).toBeNull()
  })
})