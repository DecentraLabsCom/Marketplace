import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the heavy panels so the Modal test stays focused and deterministic
jest.mock('../ProviderStakingPanel', () => ({
  __esModule: true,
  default: ({ providerAddress, labCount }) => (
    <div data-testid="mock-provider-staking-panel" data-provider={providerAddress} data-labcount={labCount} />
  ),
}))

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
  test('renders modal with panels and passes props', () => {
    const onClose = jest.fn()
    const onCollect = jest.fn()
    const addTemporaryNotification = jest.fn()

    render(
      <ProviderStakingModal
        isOpen={true}
        onClose={onClose}
        providerAddress="0xabc"
        labs={[{ id: '1' }]}
        isSSO={false}
        labCount={2}
        addTemporaryNotification={addTemporaryNotification}
        onCollect={onCollect}
        isCollectEnabled={true}
        isCollecting={true}
      />
    )

    // modal title
    const title = screen.getByRole('heading', { name: /Staking & Economics/i })
    expect(title).toBeInTheDocument()

    // modal wrapper should reflect the widened max-width (prevent regressions)
    const overlay = screen.getByRole('dialog')
    const modalContent = overlay.querySelector('div')
    // modal width intentionally uses the project-specific utility class `max-w-180`
    expect(modalContent?.className || '').toMatch(/max-w-180/)
    // grid gap reduced to better utilize modal width
    const grid = overlay.querySelector('.grid')
    expect(grid?.className || '').toMatch(/gap-4/) 

    // mocked panels render and receive props
    const stakingPanel = screen.getByTestId('mock-provider-staking-panel')
    expect(stakingPanel).toHaveAttribute('data-provider', '0xabc')
    expect(stakingPanel).toHaveAttribute('data-labcount', '2')

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
        providerAddress="0xabc"
        labs={[]}
        isSSO={false}
        labCount={0}
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
        providerAddress="0xabc"
        labs={[]}
        isSSO={false}
        labCount={0}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
