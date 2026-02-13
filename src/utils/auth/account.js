"use client";
import { useDisconnect, useEnsAvatar, useEnsName } from 'wagmi'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons'
import { useUser } from '@/context/UserContext'
import devLog from '@/utils/dev/logger'

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
 * Destroys the wallet session by calling the logout endpoint
 * @returns {Promise<void>}
 */
async function destroyWalletSession() {
  try {
    await fetch('/api/auth/wallet-logout', {
      method: 'POST',
      credentials: 'include',
    });
    devLog.log('✅ Wallet session destroyed on logout');
  } catch (error) {
    devLog.warn('⚠️ Error destroying wallet session:', error);
  }
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
      // Handle SSO logout first (it includes both SSO and wallet disconnect logic)
      if (isSSO) {
        await logoutSSO();
        // For SSO, don't force refresh - let the logout process handle UI updates
        // The UserContext will automatically update the UI when session is cleared
        return;
      }
      
      // Handle wallet disconnect - destroy session first, then disconnect wallet
      if (isConnected) {
        // Destroy the wallet session cookie before disconnecting
        await destroyWalletSession();
        disconnect();
        // For wallet-only users, small delay then redirect
        setTimeout(() => {
          window.location.href = "/";
        }, 100);
      }
    } catch (error) {
      devLog.log('Error during logout:', error);
      // Only for critical errors, redirect to home
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
            {isSSO ? (user?.institutionName || user?.affiliation || user?.name) : (user?.name || ensName)}
          </div>
          <div className="text-sm text-text-secondary">
            {isSSO ? (user?.email || user?.id || "SSO User") : formatAddress(address)}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={handleLogout}
        aria-label={isConnected ? "Disconnect wallet" : "Logout"}
        title={isConnected ? "Disconnect wallet" : "Logout"}
      >
        <FontAwesomeIcon icon={faSignOutAlt} className="text-brand font-semibold text-4xl
                hover:text-hover-dark" title={isConnected ? "Disconnect Wallet" : "Logout"}/>
      </button>
    </div>
  )
}
