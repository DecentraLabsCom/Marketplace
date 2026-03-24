import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ProviderStakingCompactCard from '../ProviderStakingCompactCard'

describe('ProviderStakingCompactCard', () => {
  test('renders receivable summary and View receivables button', () => {
    const onManage = jest.fn()

    render(
      <ProviderStakingCompactCard
        onManage={onManage}
      />
    )

    expect(screen.getByText(/Provider Receivables/i)).toBeInTheDocument()
    expect(screen.getByText(/EUR settlement & revenue breakdown/i)).toBeInTheDocument()

    const btn = screen.getByRole('button', { name: /view receivables/i })
    expect(btn).toBeInTheDocument()

    fireEvent.click(btn)
    expect(onManage).toHaveBeenCalled()
  })
})