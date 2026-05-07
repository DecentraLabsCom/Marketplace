"use client";
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'

/**
 * Microsoft Entra ID login button.
 * Initiates the OIDC authorization_code + PKCE flow by navigating to
 * /api/auth/entra/login, which redirects to the Azure authorization endpoint.
 *
 * Controlled by the NEXT_PUBLIC_ENTRA_ENABLED feature flag.
 *
 * @param {Object} props
 * @param {Function} [props.setIsModalOpen] - Optional: close parent modal before redirect
 */
export default function EntraLoginButton({ setIsModalOpen }) {
  const router = useRouter()

  // Feature flag — set NEXT_PUBLIC_ENTRA_ENABLED=true to show this button
  if (process.env.NEXT_PUBLIC_ENTRA_ENABLED !== 'true') {
    return null
  }

  const handleEntraLogin = () => {
    if (typeof setIsModalOpen === 'function') {
      setIsModalOpen(false)
    }
    router.push('/api/auth/entra/login')
  }

  return (
    <button
      onClick={handleEntraLogin}
      className="group w-full p-4 text-left rounded-xl border bg-brand border-brand hover:bg-hover-dark hover:shadow-lg text-white transition-all duration-300 hover:scale-[1.02]"
      aria-label="Sign in with Microsoft Entra ID"
    >
      <div className="flex items-center space-x-4">
        <div className="size-12 bg-white rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" className="size-6" aria-hidden="true">
            <rect x="1"  y="1"  width="10" height="10" fill="#F25022" />
            <rect x="12" y="1"  width="10" height="10" fill="#7FBA00" />
            <rect x="1"  y="12" width="10" height="10" fill="#00A4EF" />
            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-white">Institutional Login</h3>
          <p className="text-sm text-white/80">Sign in with your organization account</p>
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

EntraLoginButton.propTypes = {
  setIsModalOpen: PropTypes.func,
}

EntraLoginButton.defaultProps = {
  setIsModalOpen: null,
}
