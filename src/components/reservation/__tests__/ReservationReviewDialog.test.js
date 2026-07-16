import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import ReservationReviewDialog from '../ReservationReviewDialog'

const review = {
  labName: 'Quantum optics',
  provider: 'Provider University',
  labTime: '16 Jul 2026, 12:00 Europe/Madrid',
  userTime: '16 Jul 2026, 11:00 local time',
  duration: '60 minutes',
  unitPrice: '12 credits/hour',
  totalCost: '12 credits',
  creditBalanceAfter: '88 credits',
  cancellationPolicy: 'Eligible cancellations before the access period return applicable credits.',
  termsUrl: 'https://provider.example/terms',
}

describe('ReservationReviewDialog', () => {
  test('shows every booking consequence before allowing the confirmation action', () => {
    render(<ReservationReviewDialog review={review} onConfirm={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Review reservation' })).toBeInTheDocument()
    expect(screen.getByText('Quantum optics')).toBeInTheDocument()
    expect(screen.getByText('Provider University')).toBeInTheDocument()
    expect(screen.getByText('16 Jul 2026, 12:00 Europe/Madrid')).toBeInTheDocument()
    expect(screen.getByText('16 Jul 2026, 11:00 local time')).toBeInTheDocument()
    expect(screen.getByText('88 credits')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Read lab terms and conditions' })).toHaveAttribute(
      'href',
      'https://provider.example/terms',
    )
  })

  test('does not submit until the user explicitly confirms the review', () => {
    const onConfirm = jest.fn()
    const onCancel = jest.fn()
    render(<ReservationReviewDialog review={review} onConfirm={onConfirm} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm reservation' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
