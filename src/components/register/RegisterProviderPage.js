"use client";
import React from 'react'
import ProviderAccessDenied from './ProviderAccessDenied'
import ProviderRegisterForm from './ProviderRegisterForm'
import { validateProviderRole } from '@/utils/auth/roleValidation'
import { useUser } from '@/context/UserContext'

/**
 * Top-level page component for provider registration
 */
export default function RegisterProviderPage() {
  const { isSSO, user, isLoading, isWalletLoading } = useUser()
  
  // Show loading state while user data is being fetched
  if (isLoading || isWalletLoading) {
    return (
      <div className="container mx-auto p-4 text-center">
        <div className="flex items-center justify-center space-x-2">
          <div className="animate-spin rounded-full size-6 border-b-2 border-blue-600"></div>
          <span>Loading...</span>
        </div>
      </div>
    )
  }
  
  // For SSO users, validate their role
  if (isSSO) {
    // If user data isn't loaded yet, show loading
    if (!user) {
      return (
        <div className="container mx-auto p-4 text-center">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full size-6 border-b-2 border-blue-600"></div>
            <span>Validating permissions...</span>
          </div>
        </div>
      )
    }
    
    const roleCheck = validateProviderRole(user.role, user.scopedRole)
    if (!roleCheck.isValid) {
      return <ProviderAccessDenied 
        reason={roleCheck.reason} 
        userRole={user.role} 
        scopedRole={user.scopedRole} />
    }
  }

  // For wallet users (non-SSO) or valid SSO users, show the registration form
  return <ProviderRegisterForm />
}
