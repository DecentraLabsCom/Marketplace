/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react'
import LabBookingItem from '../LabBookingItem'

describe('service-credit policy', () => {
  test('does not expose a cash-refund action for a confirmed booking', () => {
    const now = Math.floor(Date.now() / 1000)
    render(
      <LabBookingItem
        lab={{ id: 7, name: 'Lab', provider: 'Provider' }}
        booking={{
          reservationKey: '0xabc',
          status: '1',
          start: now - 60,
          end: now + 600,
          price: '100',
        }}
        onCancel={jest.fn()}
        onRefund={jest.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel booking/i })).toBeInTheDocument()
    expect(screen.getByText(/not cash/i)).toBeInTheDocument()
  })
})
