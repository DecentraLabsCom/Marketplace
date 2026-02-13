/**
 * Tests for InstitutionalOnboardingModal component
 *
 * @group components
 * @group auth
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import InstitutionalOnboardingModal from '../InstitutionalOnboardingModal'
import { OnboardingState } from '@/hooks/user/useInstitutionalOnboarding'

// Mock dependencies
jest.mock('@/hooks/user/useInstitutionalOnboarding', () => ({
  useInstitutionalOnboarding: jest.fn(),
  OnboardingState: {
    IDLE: 'idle',
    CHECKING: 'checking',
    NOT_NEEDED: 'not_needed',
    REQUIRED: 'required',
    INITIATING: 'initiating',
    REDIRECTING: 'redirecting',
    AWAITING_COMPLETION: 'awaiting_completion',
    POLLING: 'polling',
    COMPLETED: 'completed',
    FAILED: 'failed',
    NO_BACKEND: 'no_backend',
  },
}))

jest.mock('@/components/ui/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, title, children, showCloseButton = true }) =>
    isOpen ? (
      <div data-testid="modal" data-title={title}>
        {showCloseButton && onClose ? (
          <button data-testid="modal-close" onClick={onClose}>
            Close
          </button>
        ) : null}
        {title ? <h2>{title}</h2> : null}
        {children}
      </div>
    ) : null,
}))

jest.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, variant, ...props }) => (
    <button
      data-testid={`button-${variant || 'default'}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  ),
}))

const mockUseInstitutionalOnboarding = require('@/hooks/user/useInstitutionalOnboarding').useInstitutionalOnboarding

describe('InstitutionalOnboardingModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onComplete: jest.fn(),
    onSkip: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initial state', () => {
    it('renders nothing when modal is closed', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.IDLE,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} isOpen={false} />)

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    })

    it('renders modal when open', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.IDLE,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByTestId('modal')).toBeInTheDocument()
      expect(screen.getByText('Account Setup')).toBeInTheDocument()
    })
  })

  describe('REQUIRED state', () => {
    beforeEach(() => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.REQUIRED,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn().mockResolvedValue({}),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })
    })

    it('renders setup instructions', () => {
      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Secure Your Account')).toBeInTheDocument()
      expect(screen.getByText(/To interact with laboratories/)).toBeInTheDocument()
      expect(screen.getByText('What happens next?')).toBeInTheDocument()
    })

    it('renders action buttons', () => {
      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByTestId('button-secondary')).toHaveTextContent('Later')
      expect(screen.getByTestId('button-primary')).toHaveTextContent('Set Up Now')
    })

    it('calls startOnboarding when Set Up Now is clicked', async () => {
      const mockStartOnboarding = jest.fn().mockResolvedValue({})
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.REQUIRED,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: mockStartOnboarding,
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('button-primary'))

      await waitFor(() => {
        expect(mockStartOnboarding).toHaveBeenCalled()
      })
    })

    it('calls onSkip and onClose when Later is clicked', () => {
      const mockReset = jest.fn()
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.REQUIRED,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: mockReset,
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('button-secondary'))

      expect(mockReset).toHaveBeenCalled()
      expect(defaultProps.onSkip).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  describe('loading states', () => {
    it('renders checking state', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.CHECKING,
        error: null,
        isLoading: true,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Checking your account status...')).toBeInTheDocument()
    })

    it('renders initiating state', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.INITIATING,
        error: null,
        isLoading: true,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Preparing secure registration...')).toBeInTheDocument()
    })

    it('renders redirecting state', () => {
      const mockSessionData = { ceremonyUrl: 'https://example.com/ceremony' }
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.REDIRECTING,
        error: null,
        isLoading: true,
        isCompleted: false,
        hasBackend: true,
        sessionData: mockSessionData,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Redirecting to your institution...')).toBeInTheDocument()
      expect(screen.getByText('click here')).toHaveAttribute('href', 'https://example.com/ceremony')
    })

    it('renders polling state', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.POLLING,
        error: null,
        isLoading: true,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Waiting for confirmation...')).toBeInTheDocument()
    })
  })

  describe('COMPLETED state', () => {
    it('renders success message', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.COMPLETED,
        error: null,
        isLoading: false,
        isCompleted: true,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('All Set!')).toBeInTheDocument()
      expect(screen.getByText('Your account is secured and ready for transactions.')).toBeInTheDocument()
      expect(screen.getByTestId('button-primary')).toHaveTextContent('Continue')
    })

    it('calls onComplete when completed', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.COMPLETED,
        error: null,
        isLoading: false,
        isCompleted: true,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(defaultProps.onComplete).toHaveBeenCalled()
    })
  })

  describe('NO_BACKEND state', () => {
    it('renders backend unavailable message', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.NO_BACKEND,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: false,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
      expect(screen.getByText(/Your institution hasn't configured/)).toBeInTheDocument()
      expect(screen.getByTestId('button-secondary')).toHaveTextContent('Continue Anyway')
    })
  })

  describe('FAILED state', () => {
    it('renders error message with retry option', () => {
      const mockError = 'Registration failed'
      const mockStartOnboarding = jest.fn()
      const mockReset = jest.fn()

      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.FAILED,
        error: mockError,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: mockStartOnboarding,
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: mockReset,
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.getByText('Setup Failed')).toBeInTheDocument()
      expect(screen.getByText(mockError)).toBeInTheDocument()
      expect(screen.getByTestId('button-secondary')).toHaveTextContent('Cancel')
      expect(screen.getByTestId('button-primary')).toHaveTextContent('Try Again')
    })

    it('calls startOnboarding when Try Again is clicked', () => {
      const mockStartOnboarding = jest.fn()
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.FAILED,
        error: 'Some error',
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: mockStartOnboarding,
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('button-primary'))

      expect(mockStartOnboarding).toHaveBeenCalled()
    })
  })

  describe('modal behavior', () => {
    it('prevents closing when loading', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.INITIATING,
        error: null,
        isLoading: true,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      // Modal close button should not be rendered when loading
      expect(screen.queryByTestId('modal-close')).not.toBeInTheDocument()
    })

    it('allows closing when not loading', () => {
      const mockReset = jest.fn()
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.REQUIRED,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: mockReset,
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      fireEvent.click(screen.getByTestId('modal-close'))

      expect(mockReset).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not render when no backend and idle', () => {
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.IDLE,
        error: null,
        isLoading: false,
        isCompleted: false,
        hasBackend: false,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      render(<InstitutionalOnboardingModal {...defaultProps} />)

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    })
  })

  describe('Spinner component', () => {
    it('renders with different sizes', () => {
      const { rerender } = render(<InstitutionalOnboardingModal {...defaultProps} />)

      // The Spinner is rendered internally, we can test it by checking the modal content
      mockUseInstitutionalOnboarding.mockReturnValue({
        state: OnboardingState.CHECKING,
        error: null,
        isLoading: true,
        isCompleted: false,
        hasBackend: true,
        sessionData: null,
        keyStatus: null,
        startOnboarding: jest.fn(),
        initiateOnboarding: jest.fn(),
        redirectToCeremony: jest.fn(),
        reset: jest.fn(),
      })

      rerender(<InstitutionalOnboardingModal {...defaultProps} />)

      // Check that spinner is rendered (it has animate-spin class)
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })
})

