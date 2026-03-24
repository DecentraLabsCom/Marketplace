import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the receivables panel so the Modal test stays focused and deterministic
jest.mock('../PendingPayoutsPanel', () => ({
  __esModule: true,
  default: ({ onCollect, isCollecting, isCollectEnabled }) => (
    <div data-testid="mock-pending-payouts-panel">
      <button data-testid="collect-btn" disabled={!isCollectEnabled} onClick={() => onCollect && onCollect()}>
        Collect (mock)
      </button>
      <div data-testid="collecting">{String(Boolean(isCollecting))}</div>
    </div>
  ),
}))

import ProviderStakingModal from '../ProviderStakingModal'

describe('ProviderStakingModal', () => {
  test('renders modal with receivables panel and passes props', () => {
    const onClose = jest.fn()
    const onCollect = jest.fn()
    const addTemporaryNotification = jest.fn()

    render(
      <ProviderStakingModal
        isOpen={true}
        onClose={onClose}
        labs={[{ id: '1' }]}
        isSSO={false}
        addTemporaryNotification={addTemporaryNotification}
        onCollect={onCollect}
        isCollectEnabled={true}
        isCollecting={true}
      />
    )

    // modal title
    const title = screen.getByRole('heading', { name: /Provider Receivables/i })
    expect(title).toBeInTheDocument()

    // mocked receivables panel renders and receives props
    const payoutsPanel = screen.getByTestId('mock-pending-payouts-panel')
    expect(payoutsPanel).toBeInTheDocument()
    expect(screen.getByTestId('collecting')).toHaveTextContent('true')
  })

  test('close button calls onClose and Collect forwards to handler', () => {
    const onClose = jest.fn()
    const onCollect = jest.fn()

    render(
      <ProviderStakingModal
        isOpen={true}
        onClose={onClose}
        labs={[]}
        isSSO={false}
        addTemporaryNotification={() => {}}
        onCollect={onCollect}
        isCollectEnabled={true}
        isCollecting={false}
      />
    )

    const closeBtn = screen.getByLabelText(/Close modal/i)
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()

    const collectBtn = screen.getByTestId('collect-btn')
    fireEvent.click(collectBtn)
    expect(onCollect).toHaveBeenCalled()
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
