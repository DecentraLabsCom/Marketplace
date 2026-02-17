import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import PopupBlockerModal from '../PopupBlockerModal'
import { getPopupGuidance, POPUP_BLOCKED_EVENT } from '@/utils/browser/popupBlockerGuidance'

jest.mock('@/utils/browser/popupBlockerGuidance', () => ({
  POPUP_BLOCKED_EVENT: 'marketplace:popup-blocked',
  getPopupGuidance: jest.fn(),
}))

const createGuidance = (overrides = {}) => ({
  browser: 'Chrome-based browser',
  iconSide: 'right',
  locationLabel: 'Right side of the address bar',
  title: 'Allow pop-up windows',
  description: 'Your browser blocked a pop-up.',
  steps: [],
  ...overrides,
})

const emitPopupBlocked = (detail = {}) => {
  window.dispatchEvent(new window.CustomEvent(POPUP_BLOCKED_EVENT, { detail }))
}

describe('PopupBlockerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getPopupGuidance.mockReturnValue(createGuidance())
  })

  test('opens compact bubble from popup-blocked event and closes with dismiss button', async () => {
    render(<PopupBlockerModal />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await waitFor(() => {
      emitPopupBlocked({ source: 'onboarding-webauthn' })
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Pop-up blocked: click the icon on the right side of the address bar/i)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Dismiss pop-up guidance'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('positions bubble on the left when browser guidance indicates left-side icon', async () => {
    getPopupGuidance.mockReturnValue(
      createGuidance({
        iconSide: 'left',
        locationLabel: 'Left side of the address bar',
      })
    )

    render(<PopupBlockerModal />)

    await waitFor(() => {
      emitPopupBlocked({ source: 'booking-authorize' })
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const bubble = screen.getByRole('alert')
    expect(bubble).toHaveClass('left-2')
    expect(bubble).not.toHaveClass('right-2')
  })

  test('closes with Escape key and outside click', async () => {
    render(<PopupBlockerModal />)
    await waitFor(() => {
      emitPopupBlocked({ source: 'lab-signature' })
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await waitFor(() => {
      emitPopupBlocked({ source: 'lab-signature' })
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('uses mobile-specific layout and message without pointer indicators', async () => {
    getPopupGuidance.mockReturnValue(
      createGuidance({
        browser: 'Mobile browser',
        locationLabel: 'Browser menu / address bar',
      })
    )

    const { container } = render(<PopupBlockerModal />)
    await waitFor(() => {
      emitPopupBlocked({ source: 'onboarding-webauthn' })
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    const bubble = screen.getByRole('alert')
    expect(bubble).toHaveClass('inset-x-2')
    expect(bubble).toHaveClass('bottom-2')
    expect(bubble).not.toHaveClass('left-2')
    expect(bubble).not.toHaveClass('right-2')
    expect(
      screen.getByText(/mobile browser may open this flow in a new tab/i)
    ).toBeInTheDocument()
    expect(container.querySelector('.rotate-45')).not.toBeInTheDocument()
  })
})
