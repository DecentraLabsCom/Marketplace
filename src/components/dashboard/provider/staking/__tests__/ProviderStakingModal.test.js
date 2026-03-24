import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the receivables panel so the Modal test stays focused and deterministic
jest.mock('../PendingPayoutsPanel', () => ({
  __esModule: true,
  default: ({ onRequestSettlement, isRequestingSettlement, isSettlementEnabled }) => (
    <div data-testid="mock-pending-payouts-panel">
      <button data-testid="settlement-btn" disabled={!isSettlementEnabled} onClick={() => onRequestSettlement && onRequestSettlement()}>
        Request Settlement (mock)
      </button>
      <div data-testid="requesting-settlement">{String(Boolean(isRequestingSettlement))}</div>
    </div>
  ),
}))

import ProviderStakingModal from '../ProviderStakingModal'

describe('ProviderStakingModal', () => {
  test('renders modal with receivables panel and passes props', () => {
    const onClose = jest.fn()
    const onRequestSettlement = jest.fn()
    const addTemporaryNotification = jest.fn()

    render(
      <ProviderStakingModal
        isOpen={true}
        onClose={onClose}
        labs={[{ id: '1' }]}
        isSSO={false}
        addTemporaryNotification={addTemporaryNotification}
        onRequestSettlement={onRequestSettlement}
        isSettlementEnabled={true}
        isRequestingSettlement={true}
      />
    )

    // modal title
    const title = screen.getByRole('heading', { name: /Provider Receivables/i })
    expect(title).toBeInTheDocument()

    // mocked receivables panel renders and receives props
    const payoutsPanel = screen.getByTestId('mock-pending-payouts-panel')
    expect(payoutsPanel).toBeInTheDocument()
    expect(screen.getByTestId('requesting-settlement')).toHaveTextContent('true')
  })

  test('close button calls onClose and settlement request forwards to handler', () => {
    const onClose = jest.fn()
    const onRequestSettlement = jest.fn()

    render(
      <ProviderStakingModal
        isOpen={true}
        onClose={onClose}
        labs={[]}
        isSSO={false}
        addTemporaryNotification={() => {}}
        onRequestSettlement={onRequestSettlement}
        isSettlementEnabled={true}
        isRequestingSettlement={false}
      />
    )

    const closeBtn = screen.getByLabelText(/Close modal/i)
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()

    const settlementBtn = screen.getByTestId('settlement-btn')
    fireEvent.click(settlementBtn)
    expect(onRequestSettlement).toHaveBeenCalled()
  })

  test('does not render when isOpen is false', () => {
    const onClose = jest.fn()

    const { container } = render(
      <ProviderStakingModal
        isOpen={false}
        onClose={onClose}
        labs={[]}
        isSSO={false}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
