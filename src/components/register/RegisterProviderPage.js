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
  const { isSSO, user } = useUser()
  const roleCheck = isSSO ? validateProviderRole(user.role, user.scopedRole) : { isValid: true }
  
  if (isSSO && !roleCheck.isValid) {
    return <ProviderAccessDenied 
      reason={roleCheck.reason} 
      userRole={user.role} 
      scopedRole={user.scopedRole} />
  }

  return <ProviderRegisterForm />
}
