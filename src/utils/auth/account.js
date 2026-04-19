"use client";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons'
import { useUser } from '@/context/UserContext'
import devLog from '@/utils/dev/logger'

function formatAddress(address) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Account component for institutional authentication and logout.
 * @returns {JSX.Element} Account display and logout interface
 */
export default function Account() {
  const { isLoggedIn, address, user, logoutSSO } = useUser();

  const handleLogout = async () => {
    try {
      await logoutSSO();
    } catch (error) {
      devLog.log('Error during logout:', error);
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }

  return (
    <div className="flex items-center space-x-6 font-bold">
      {isLoggedIn && (
        <div className="pointer-events-none flex flex-col items-center">
          <div className="text-sm text-hover-dark">
            {user?.institutionName || user?.affiliation || user?.name}
          </div>
          <div className="text-sm text-text-secondary">
            {user?.email || user?.id || formatAddress(address)}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={handleLogout}
        aria-label="Logout"
        title="Logout"
      >
        <FontAwesomeIcon icon={faSignOutAlt} className="text-brand font-semibold text-4xl
                hover:text-hover-dark" title="Logout"/>
      </button>
    </div>
  )
}
