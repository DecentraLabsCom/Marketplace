"use client";
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUniversity } from '@fortawesome/free-solid-svg-icons'
import EntraLoginButton from '@/components/auth/EntraLoginButton'

/**
 * Institutional login component for federation-based SSO authentication
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
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleInstitutionalLogin}
        className="group w-full rounded-xl border border-brand bg-brand p-4 text-left text-white transition-all duration-300 hover:scale-[1.02] hover:bg-hover-dark hover:shadow-lg"
      >
        <div className="flex items-center space-x-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-white shadow-sm">
            <FontAwesomeIcon icon={faUniversity} className="text-brand text-lg" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">EduGAIN / SAML2</h3>
            <p className="text-sm text-white/80">Institutional SSO authentication</p>
          </div>
          <span aria-hidden="true" className="text-xl opacity-0 transition-opacity group-hover:opacity-100">→</span>
        </div>
      </button>
      <EntraLoginButton setIsModalOpen={setIsModalOpen} />
    </div>
  )
}

InstitutionalLogin.propTypes = {
  setIsModalOpen: PropTypes.func.isRequired
}
