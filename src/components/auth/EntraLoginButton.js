"use client"

import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'

export default function EntraLoginButton({ setIsModalOpen }) {
  const router = useRouter()

  const handleLogin = () => {
    setIsModalOpen(false)
    router.push('/api/auth/entra/login')
  }

  return (
    <button
      type="button"
      onClick={handleLogin}
      className="group w-full rounded-xl border border-neutral-300 bg-white p-4 text-left text-neutral-900 transition-all duration-300 hover:scale-[1.02] hover:border-blue-500 hover:shadow-lg"
    >
      <div className="flex items-center space-x-4">
        <div className="flex size-12 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white shadow-sm">
          M
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Microsoft Entra ID</h3>
          <p className="text-sm text-neutral-600">Institutional OIDC login</p>
        </div>
        <span aria-hidden="true" className="text-xl opacity-0 transition-opacity group-hover:opacity-100">→</span>
      </div>
    </button>
  )
}

EntraLoginButton.propTypes = {
  setIsModalOpen: PropTypes.func.isRequired,
}
