"use client";
import React, { useState } from 'react'
import { Container, Button } from '@/components/ui'
import ProviderAccessDenied from './ProviderAccessDenied'
import ProviderRegisterForm from './ProviderRegisterForm'
import { hasAdminRole } from '@/utils/auth/roleValidation'
import { useUser } from '@/context/UserContext'
import InstitutionInviteCard from '@/components/dashboard/user/InstitutionInviteCard'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUsers, faFlask, faCheckCircle } from '@fortawesome/free-solid-svg-icons'

/**
 * Top-level page component for registration
 * Routes users either to:
 *  - Institutional registration (SSO + institutional admin roles) with Consumer/Provider choice, or
 *  - Manual institution registration form (wallet-based or SSO without institutional admin role), or
 *  - Access denied, based on role validation.
 * @returns {JSX.Element} Registration page with role-based access control
 */
export default function RegisterPage() {
  const { isSSO, user, isLoading, isWalletLoading } = useUser()
  const [institutionMode, setInstitutionMode] = useState(null) // 'provider' | 'consumer' | null
  const [hoveredCard, setHoveredCard] = useState(null) // Track which card is hovered
  
  // Show loading state while user data is being fetched
  if (isLoading || isWalletLoading) {
    return (
      <Container padding="sm" className="text-center mt-6">
        <div className="flex-center space-x-2">
          <div className="spinner-md border-blue-600"></div>
          <span>Loading...</span>
        </div>
      </Container>
    )
  }
  
  // For SSO users, validate their role
  if (isSSO) {
    // If user data isn't loaded yet, show loading
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

    // If SSO role is not eligible for institution-level flows, deny access
    if (!canUseInstitutionFlow) {
      return <ProviderAccessDenied 
        reason={'Your institutional role does not allow institution-level registration. Only staff, employees, or faculty can register an institution.'} 
        userRole={user.role} 
        scopedRole={user.scopedRole} />
    }

    // SSO + institutional admin roles: show institution registration choices with modal follow-ups
    if (canUseInstitutionFlow) {
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
                  provisioning token to auto-configure the wallet dashboard for your institution.
                </p>
              </div>

              {/* Modern card selector with animations */}
              <div className="relative grid md:grid-cols-2 gap-8 px-4">
                {/* Consumer Card */}
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
                  {/* Gradient background overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-header-bg/30 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  <div className="relative z-10">
                    {/* Header */}
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

                    {/* Description */}
                    <p className="text-gray-600 mb-6 leading-relaxed min-h-[80px]">
                      Cover lab reservation costs made by your students and staff. Offer them access to online laboratories worldwide without listing your own facilities.
                    </p>

                    {/* Icon */}
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

                    {/* Features list */}
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

                    {/* Button */}
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

                {/* Provider Card */}
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
                  {/* Gradient background overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-text-secondary/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  <div className="relative z-10">
                    {/* Header */}
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

                    {/* Description */}
                    <p className="text-gray-600 mb-6 leading-relaxed min-h-[80px]">
                      List and share your institution&rsquo;s labs in the marketplace. Receive payouts for external reservations and expand your reach worldwide.
                    </p>

                    {/* Icon */}
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

                    {/* Features list */}
                    <ul className="space-y-2 mb-6 text-sm text-gray-600">
                      <li className="flex items-center">
                        <FontAwesomeIcon icon={faCheckCircle} className="text-text-secondary mr-2 text-base" />
                        Get 1000 $LAB tokens + all advantages from consumers!
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

                    {/* Button */}
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
                Disclaimer: This should only be used by staff responsible for managing institutional wallets.
              </p>

            </div>
          </Container>

          {renderModal()}
        </>
      )
    }
  }

  // For wallet users (non-SSO) or valid SSO users without institutional admin role,
  // show the manual provider registration form
  return <ProviderRegisterForm />
}
