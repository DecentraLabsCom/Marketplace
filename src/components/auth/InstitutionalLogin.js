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
    router.push("/api/auth/sso/saml2/login");
  }

  return (
    <div onClick={handleInstitutionalLogin}
        className="bg-brand text-white font-bold rounded-lg px-4 py-2 transition duration-300 
        cursor-pointer ease-in-out hover:bg-[#333f63] hover:text-white  flex items-center 
        justify-center"
        >
        <FontAwesomeIcon icon={faUniversity} className="font-semibold text-4xl mr-3" title="Institutional Account"/>
        Institutional Login
    </div>
  )
}

InstitutionalLogin.propTypes = {
  setIsModalOpen: PropTypes.func.isRequired
}
