/**
 * Institutional Onboarding Modal
 * 
 * Modal component that guides SSO users through the WebAuthn
 * credential registration process with their institutional backend.
 * 
 * @module components/auth/InstitutionalOnboardingModal
 */

'use client'

import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useInstitutionalOnboarding, OnboardingState } from '@/hooks/user/useInstitutionalOnboarding'
import { Button } from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { designSystem } from '@/styles/designSystem'

/**
 * Loading spinner component
 */
function Spinner({ size = 'md' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} text-primary-500`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

Spinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
}

/**
 * Institutional Onboarding Modal component
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Close handler
 * @param {function} [props.onComplete] - Called when onboarding completes
 * @param {function} [props.onSkip] - Called when user skips onboarding
 * @returns {JSX.Element}
 */
export function InstitutionalOnboardingModal({ 
  isOpen, 
  onClose, 
  onComplete,
  onSkip,
}) {
  const {
    state,
    error,
    isLoading,
    isCompleted,
    hasBackend,
    sessionData,
    keyStatus,
    startOnboarding,
    initiateOnboarding,
    redirectToCeremony,
    reset,
  } = useInstitutionalOnboarding({ autoPoll: true, autoCheck: isOpen })

  // Notify parent when completed
  useEffect(() => {
    if (isCompleted && onComplete) {
      onComplete()
    }
  }, [isCompleted, onComplete])

  const handleStart = async () => {
    await startOnboarding()
  }

  const handleRegisterHere = async () => {
    const initResult = await initiateOnboarding?.()
    if (initResult?.ceremonyUrl) {
      redirectToCeremony?.(initResult.ceremonyUrl)
    }
  }

  const handleSkip = () => {
    reset()
    onSkip?.()
    onClose()
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Render content based on state
  const renderContent = () => {
    const advisoryNeeded =
      keyStatus?.hasCredential &&
      keyStatus?.hasPlatformCredential === false &&
      !isLoading &&
      ![
        OnboardingState.CHECKING,
        OnboardingState.INITIATING,
        OnboardingState.REDIRECTING,
        OnboardingState.AWAITING_COMPLETION,
        OnboardingState.POLLING,
      ].includes(state)

    if (advisoryNeeded) {
      return (
        <div className="space-y-4">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Passkey on Another Device?
            </h3>
            <p className="text-gray-600 text-sm">
              We found a credential for your account, but it may live on a different
              device. If you don&apos;t see a PIN or biometric prompt here, register a
              passkey on this device.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
            <h4 className="text-sm font-medium text-amber-800 mb-1">What you can do</h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                Use the device where the passkey was created
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                Or register a passkey on this device now
              </li>
            </ul>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={handleClose}>
              Continue
            </Button>
            <Button variant="primary" onClick={handleRegisterHere}>
              Register Here
            </Button>
          </div>
        </div>
      )
    }

    switch (state) {
      case OnboardingState.IDLE:
      case OnboardingState.REQUIRED:
        return (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Secure Your Account
              </h3>
              <p className="text-gray-600 text-sm">
                To interact with laboratories and make bookings, you need to register 
                a secure credential with your institution. This is a one-time setup 
                that enables passwordless transactions.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <h4 className="text-sm font-medium text-blue-800 mb-1">What happens next?</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li className="flex items-start">
                  <span className="mr-2">1.</span>
                  You&apos;ll be redirected to your institution&apos;s secure portal
                </li>
                <li className="flex items-start">
                  <span className="mr-2">2.</span>
                  Register using your device&apos;s biometrics or security key
                </li>
                <li className="flex items-start">
                  <span className="mr-2">3.</span>
                  Return here automatically when done
                </li>
              </ul>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="secondary"
                onClick={handleSkip}
              >
                Later
              </Button>
              <Button
                variant="primary"
                onClick={handleStart}
              >
                Set Up Now
              </Button>
            </div>
          </div>
        )

      case OnboardingState.CHECKING:
        return (
          <div className="flex flex-col items-center py-8">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600">Checking your account status...</p>
          </div>
        )

      case OnboardingState.INITIATING:
        return (
          <div className="flex flex-col items-center py-8">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600">Preparing secure registration...</p>
          </div>
        )

      case OnboardingState.REDIRECTING:
        return (
          <div className="flex flex-col items-center py-8">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600">Redirecting to your institution...</p>
            <p className="text-sm text-gray-500 mt-2">
              If not redirected automatically,{' '}
              <a 
                href={sessionData?.ceremonyUrl} 
                className="text-primary-600 hover:underline"
              >
                click here
              </a>
            </p>
          </div>
        )

      case OnboardingState.AWAITING_COMPLETION:
      case OnboardingState.POLLING:
        return (
          <div className="flex flex-col items-center py-8">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600">Waiting for confirmation...</p>
            <p className="text-sm text-gray-500 mt-2">
              Complete the registration in the institutional portal
            </p>
          </div>
        )

      case OnboardingState.COMPLETED:
      case OnboardingState.NOT_NEEDED:
        return (
          <div className="flex flex-col items-center py-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">All Set!</h3>
            <p className="text-gray-600 text-sm text-center">
              Your account is secured and ready for transactions.
            </p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={handleClose}
            >
              Continue
            </Button>
          </div>
        )

      case OnboardingState.NO_BACKEND:
        return (
          <div className="flex flex-col items-center py-8">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Service Unavailable</h3>
            <p className="text-gray-600 text-sm text-center mb-4">
              Your institution hasn&apos;t configured the credential service yet.
              Some features may be limited.
            </p>
            <Button variant="secondary" onClick={handleClose}>
              Continue Anyway
            </Button>
          </div>
        )

      case OnboardingState.FAILED:
        return (
          <div className="flex flex-col items-center py-8">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Setup Failed</h3>
            <p className="text-gray-600 text-sm text-center mb-2">
              {error || 'Something went wrong during the setup process.'}
            </p>
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleStart}>
                Try Again
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // Don't render if no backend and not explicitly required
  if (!hasBackend && state === OnboardingState.IDLE) {
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? undefined : handleClose}
      title={state === OnboardingState.COMPLETED ? undefined : 'Account Setup'}
      size="md"
    >
      {renderContent()}
    </Modal>
  )
}

InstitutionalOnboardingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onComplete: PropTypes.func,
  onSkip: PropTypes.func,
}

export default InstitutionalOnboardingModal
