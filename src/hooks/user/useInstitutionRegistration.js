import { useState, useEffect } from 'react'
import { useInstitutionResolve } from '@/hooks/user/useUsers'
import devLog from '@/utils/dev/logger'

/**
 * Resolves whether the user's institution is registered on-chain and derives
 * the associated wallet address and backend URL.
 *
 * @param {boolean|undefined} isSSO - Whether the current session is SSO
 * @param {Object|null} user - Current SSO user object
 * @param {string|null} institutionDomain - e.g. "uned.es"
 * @returns {{ institutionRegistrationStatus: string|null, institutionRegistrationWallet: string|null, institutionBackendUrl: string|null }}
 */
export function useInstitutionRegistration(isSSO, user, institutionDomain) {
  const [institutionRegistrationStatus, setInstitutionRegistrationStatus] = useState(null)
  const [institutionRegistrationWallet, setInstitutionRegistrationWallet] = useState(null)
  const [institutionBackendUrl, setInstitutionBackendUrl] = useState(null)

  const {
    data: institutionData,
    isLoading: isInstitutionResolveLoading,
    error: institutionResolveError,
  } = useInstitutionResolve(institutionDomain, {
    enabled: isSSO && Boolean(user) && Boolean(institutionDomain),
  })

  useEffect(() => {
    if (!isSSO || !user) {
      setInstitutionRegistrationStatus(null)
      setInstitutionRegistrationWallet(null)
      setInstitutionBackendUrl(null)
      return
    }

    if (!institutionDomain) {
      setInstitutionRegistrationStatus('error')
      setInstitutionRegistrationWallet(null)
      setInstitutionBackendUrl(null)
      return
    }

    if (isInstitutionResolveLoading) {
      setInstitutionRegistrationStatus('checking')
      return
    }

    if (institutionResolveError) {
      devLog.warn('[InstitutionRegistration] Resolve failed:', institutionResolveError)
      setInstitutionRegistrationStatus('error')
      setInstitutionRegistrationWallet(null)
      setInstitutionBackendUrl(null)
      return
    }

    if (institutionData) {
      if (institutionData.registered) {
        setInstitutionRegistrationStatus('registered')
        setInstitutionRegistrationWallet(institutionData.wallet || null)
        setInstitutionBackendUrl(institutionData.backendUrl || null)
      } else {
        setInstitutionRegistrationStatus('unregistered')
        setInstitutionRegistrationWallet(null)
        setInstitutionBackendUrl(null)
      }
    }
  }, [isSSO, user, institutionDomain, institutionData, isInstitutionResolveLoading, institutionResolveError])

  return { institutionRegistrationStatus, institutionRegistrationWallet, institutionBackendUrl }
}
