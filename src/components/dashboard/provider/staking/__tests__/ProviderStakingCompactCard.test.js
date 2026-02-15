import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ProviderStakingCompactCard from '../ProviderStakingCompactCard'

describe('ProviderStakingCompactCard', () => {
  test('renders summary, health and Manage button', () => {
    const onManage = jest.fn()

    render(
      <ProviderStakingCompactCard
        stakeInfo={{ stakedAmount: '0', requiredStake: '0', slashedAmount: '0' }}
        onManage={onManage}
      />
    )

    expect(screen.getByText(/Staking & payouts/i)).toBeInTheDocument()
    // StakeHealthIndicator shows "No stake required" when requiredStake is 0
    expect(screen.getByText(/No stake required/i)).toBeInTheDocument()

    const btn = screen.getByRole('button', { name: /manage staking/i })
    expect(btn).toBeInTheDocument()

    fireEvent.click(btn)
    expect(onManage).toHaveBeenCalled()
  })
})