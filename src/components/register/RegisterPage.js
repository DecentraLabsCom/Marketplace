"use client";
import React, { useEffect, useState } from 'react'
import { Container, Button } from '@/components/ui'
import ProviderAccessDenied from './ProviderAccessDenied'
import { hasAdminRole } from '@/utils/auth/roleValidation'
import { useUser } from '@/context/UserContext'
import InstitutionInviteCard from '@/components/dashboard/user/InstitutionInviteCard'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUsers, faFlask, faCheckCircle } from '@fortawesome/free-solid-svg-icons'
import { useRouter } from 'next/navigation'

/**
 * Top-level page component for institutional registration.
 * Only SSO-authenticated institution admins can use this page.
 */
export default function RegisterPage() {
  const {
    isSSO,
    user,
    isLoading,
    isInstitutionRegistered,
    isInstitutionRegistrationLoading,
    institutionRegistrationStatus,
  } = useUser()
  const router = useRouter()
  const [institutionMode, setInstitutionMode] = useState(null)
  const [hoveredCard, setHoveredCard] = useState(null)
  const isInstitutionRegistrationPending =
    isSSO && user && (isInstitutionRegistrationLoading || institutionRegistrationStatus == null)

  useEffect(() => {
    if (isSSO && user && !isInstitutionRegistrationPending && isInstitutionRegistered) {
      router.push('/')
    }
  }, [isSSO, user, isInstitutionRegistrationPending, isInstitutionRegistered, router])

  if (isLoading) {
    return (
      <Container padding="sm" className="text-center mt-6">
        <div className="flex-center space-x-2">
          <div className="spinner-md border-blue-600"></div>
          <span>Loading...</span>
        </div>
      </Container>
    )
  }

  if (!isSSO) {
    return (
      <ProviderAccessDenied
        reason="Institutional login is required to register an institution."
      />
    )
  }

  if (isInstitutionRegistrationPending) {
    return (
      <Container padding="sm" className="text-center mt-6">
        <div className="flex-center space-x-2">
          <div className="spinner-md border-blue-600"></div>
          <span>Checking institution registration...</span>
        </div>
      </Container>
    )
  }

  if (isSSO && user && isInstitutionRegistered) {
    return (
      <Container padding="sm" className="text-center mt-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-yellow-800 text-xl font-semibold mb-2">Access Restricted</h2>
          <p className="text-yellow-600 mb-4">
            Your institution is already registered. Contact your administrator if you need updates.
          </p>
        </div>
      </Container>
    )
  }

  if (!user) {
    return (
      <Container padding="sm" className="text-center">
        <div className="flex-center space-x-2">
          <div className="spinner-md border-blue-600"></div>
          <span>Validating permissions...</span>
        </div>
      </Container>
    )
  }

  const canUseInstitutionFlow = hasAdminRole(user.role, user.scopedRole)

  if (!canUseInstitutionFlow) {
    return (
      <ProviderAccessDenied
        reason="Your institutional role does not allow institution-level registration. Only staff, employees, or faculty can register an institution."
        userRole={user.role}
        scopedRole={user.scopedRole}
      />
    )
  }

  const renderModal = () => {
    if (!institutionMode) return null

    return (
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        onClick={() => setInstitutionMode(null)}
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-xl mx-auto">
            <InstitutionInviteCard
              className="shadow-lg"
              defaultTokenType={institutionMode}
              lockTokenType
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <Container padding="sm">
        <div className="max-w-5xl mx-auto mt-8">
          <div className="text-center mb-8">
            <p className="text-neutral-200 max-w-2xl mx-auto">
              Choose how your institution wants to participate in the DecentraLabs marketplace and generate a short-lived
              provisioning token to auto-configure institutional provisioning for your organization.
            </p>
          </div>

          <div className="relative grid md:grid-cols-2 gap-8 px-4">
            <div
              className={`
                relative bg-white rounded-2xl shadow-xl p-8
                transition-all duration-500 ease-out
                hover:shadow-2xl hover:-translate-y-2
                ${hoveredCard === 'consumer' ? 'scale-105 z-10' : hoveredCard ? 'scale-95 opacity-75' : 'scale-100'}
                border-2 border-transparent hover:border-header-bg
                cursor-pointer group
              `}
              onMouseEnter={() => setHoveredCard('consumer')}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => setInstitutionMode('consumer')}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-header-bg/30 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 group-hover:text-[#8ab4d4] transition-colors duration-300">
                    Consumer
                  </h2>
                  <div className={`
                    size-6 rounded-full border-2 flex items-center justify-center
                    transition-all duration-300
                    ${hoveredCard === 'consumer' ? 'border-header-bg bg-header-bg' : 'border-gray-300'}
                  `}>
                    {hoveredCard === 'consumer' && (
                      <FontAwesomeIcon icon={faCheckCircle} className="text-hover-dark text-sm" />
                    )}
                  </div>
                </div>

                <p className="text-gray-600 mb-6 leading-relaxed min-h-[80px]">
                  Cover lab reservation costs made by your students and staff. Offer them access to online laboratories worldwide without listing your own facilities.
                </p>

                <div className="flex justify-center my-8">
                  <div className={`
                    size-24 rounded-full flex items-center justify-center
                    bg-gradient-to-br from-header-bg/50 to-header-bg/20
                    transition-all duration-500
                    ${hoveredCard === 'consumer' ? 'scale-110 rotate-6' : 'scale-100'}
                    group-hover:shadow-lg
                  `}>
                    <FontAwesomeIcon
                      icon={faUsers}
                      className="text-4xl text-[#8ab4d4] transition-transform duration-500 group-hover:scale-110"
                    />
                  </div>
                </div>

                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-[#8ab4d4] mr-2 text-base" />
                    Cover expenses for student and staff lab access
                  </li>
                  <li className="flex items-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-[#8ab4d4] mr-2 text-base" />
                    Comprehensive spending limits management
                  </li>
                  <li className="flex items-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-[#8ab4d4] mr-2 text-base" />
                    No lab infrastructure required & minimal setup
                  </li>
                </ul>

                <Button
                  variant="primary"
                  size="lg"
                  width="full"
                  className="transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg !bg-[#8ab4d4] hover:!bg-[#7aa3c4]"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInstitutionMode('consumer')
                  }}
                >
                  Continue as Consumer
                </Button>
              </div>
            </div>

            <div
              className={`
                relative bg-white rounded-2xl shadow-xl p-8
                transition-all duration-500 ease-out
                hover:shadow-2xl hover:-translate-y-2
                ${hoveredCard === 'provider' ? 'scale-105 z-10' : hoveredCard ? 'scale-95 opacity-75' : 'scale-100'}
                border-2 border-transparent hover:border-text-secondary
                cursor-pointer group
              `}
              onMouseEnter={() => setHoveredCard('provider')}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => setInstitutionMode('provider')}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-text-secondary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 group-hover:text-text-secondary transition-colors duration-300">
                    Provider
                  </h2>
                  <div className={`
                    size-6 rounded-full border-2 flex items-center justify-center
                    transition-all duration-300
                    ${hoveredCard === 'provider' ? 'border-text-secondary bg-text-secondary' : 'border-gray-300'}
                  `}>
                    {hoveredCard === 'provider' && (
                      <FontAwesomeIcon icon={faCheckCircle} className="text-white text-sm" />
                    )}
                  </div>
                </div>

                <p className="text-gray-600 mb-6 leading-relaxed min-h-[80px]">
                  List and share your institution&apos;s labs in the marketplace. Receive payouts for external reservations and expand your reach worldwide.
                </p>

                <div className="flex justify-center my-8">
                  <div className={`
                    size-24 rounded-full flex items-center justify-center
                    bg-gradient-to-br from-text-secondary/20 to-text-secondary/5
                    transition-all duration-500
                    ${hoveredCard === 'provider' ? 'scale-110 -rotate-6' : 'scale-100'}
                    group-hover:shadow-lg
                  `}>
                    <FontAwesomeIcon
                      icon={faFlask}
                      className="text-4xl text-text-secondary transition-transform duration-500 group-hover:scale-110"
                    />
                  </div>
                </div>

                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-text-secondary mr-2 text-base" />
                    Get onboarding service credits + all advantages from consumers!
                  </li>
                  <li className="flex items-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-text-secondary mr-2 text-base" />
                    Set availability and pricing for your shared labs
                  </li>
                  <li className="flex items-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-text-secondary mr-2 text-base" />
                    Get notifications upon reservations
                  </li>
                </ul>

                <Button
                  variant="primary"
                  size="lg"
                  width="full"
                  className="transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg !bg-text-secondary hover:!bg-text-secondary/90"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInstitutionMode('provider')
                  }}
                >
                  Continue as Provider
                </Button>
              </div>
            </div>
          </div>

          <p className="text-sm text-neutral-200 text-center mt-6">
            Disclaimer: This area is only for institution staff authorized to provision marketplace access for their organization.
          </p>
        </div>
      </Container>

      {renderModal()}
    </>
  )
}
