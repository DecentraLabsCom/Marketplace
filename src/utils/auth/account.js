"use client";
import { useDisconnect, useEnsAvatar, useEnsName } from 'wagmi'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons'
import { useUser } from '@/context/UserContext'

/**
 * Format wallet address for display purposes
 * Truncates address to show first 6 and last 4 characters
 * @param {string} address - Wallet address to format
 * @returns {string} Formatted address or "Not connected" if no address
 */
function formatAddress(address) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Account component for user authentication and logout
 * Displays user information and provides logout functionality for both wallet and SSO users
 * @returns {JSX.Element} Account display and logout interface
 */
export default function Account() {
  const { isConnected, isSSO, isLoggedIn, address, user, logoutSSO } = useUser();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName });

  const handleLogout = async () => {
    try {
      // Handle wallet disconnect
      if (isConnected) {
        disconnect();
      }
      
      // Handle SSO logout
      if (isSSO) {
        const success = await logoutSSO();
        if (success) {
          // Redirect to home page after successful logout
          window.location.href = "/";
        } else {
          // Fallback: force reload if logout had issues
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Fallback: reload the page anyway
      window.location.reload();
    }
  }

  return (
    <div className="flex items-center space-x-6 ml-auto font-bold">
      {isLoggedIn && (
        <div className="pointer-events-none flex flex-col items-center">
          <div className="text-sm text-hover-dark">
            {isSSO ? (user?.institutionName || user?.affiliation || user?.name) : (user?.name || ensName)}
          </div>
          <div className="text-sm text-secondary">
            {isSSO ? (user?.email || user?.id || "SSO User") : formatAddress(address)}
          </div>
        </div>
      )}
      <button onClick={handleLogout}>
        <FontAwesomeIcon icon={faSignOutAlt} className="text-brand font-semibold text-4xl
                hover:text-hover-dark" title={isConnected ? "Disconnect Wallet" : "Logout"}/>
      </button>
    </div>
  )
}