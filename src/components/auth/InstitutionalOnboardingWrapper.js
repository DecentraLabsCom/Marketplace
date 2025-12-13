/**
 * Institutional Onboarding Wrapper
 * 
 * Component that renders the institutional onboarding modal
 * when needed for SSO users. Should be placed inside UserData context.
 * 
 * @module components/auth/InstitutionalOnboardingWrapper
 */

'use client'

import { useUser } from '@/context/UserContext'
import { InstitutionalOnboardingModal } from './InstitutionalOnboardingModal'

/**
 * Wrapper component that conditionally renders the onboarding modal
 * based on user context state.
 * 
 * @returns {JSX.Element|null} Modal component or null
 */
export function InstitutionalOnboardingWrapper() {
  const { 
    isSSO,
    showOnboardingModal,
    closeOnboardingModal,
    handleOnboardingComplete,
    handleOnboardingSkip,
  } = useUser()

  // Only render for SSO users
  if (!isSSO) {
    return null
  }

  return (
    <InstitutionalOnboardingModal
      isOpen={showOnboardingModal}
      onClose={closeOnboardingModal}
      onComplete={handleOnboardingComplete}
      onSkip={handleOnboardingSkip}
    />
  )
}

export default InstitutionalOnboardingWrapper
