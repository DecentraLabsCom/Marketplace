"use client";
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUniversity } from '@fortawesome/free-solid-svg-icons'

/**
 * Institutional login component for SAML2-based SSO authentication
 * Redirects users to institutional identity provider for secure authentication
 * @param {Object} props
 * @param {Function} props.setIsModalOpen - Function to close the login modal before redirect
 * @returns {JSX.Element} Institutional login button with university icon
 */
export default function InstitutionalLogin({ setIsModalOpen }) {
  const router = useRouter();

  const handleInstitutionalLogin = () => {
    setIsModalOpen(false);
    // In development, allow optional mock SSO flow for local testing
    const useMockSSO = process.env.NEXT_PUBLIC_ENABLE_MOCK_SSO === 'true';
    if (useMockSSO) {
      router.push("/api/auth/dev/mock-sso");
    } else {
      router.push("/api/auth/sso/saml2/login");
    }
  }

  return (
    <button 
      onClick={handleInstitutionalLogin}
      className="group w-full p-4 text-left rounded-xl border bg-brand border-brand hover:bg-hover-dark hover:shadow-lg text-white transition-all duration-300 hover:scale-[1.02]"
    >
      <div className="flex items-center space-x-4">
        <div className="size-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
          <FontAwesomeIcon icon={faUniversity} className="text-brand text-lg" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-white">
            Institutional Login
          </h3>
          <p className="text-sm text-white/80">
            SSO authentication
          </p>
        </div>
        <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  )
}

InstitutionalLogin.propTypes = {
  setIsModalOpen: PropTypes.func.isRequired
}
