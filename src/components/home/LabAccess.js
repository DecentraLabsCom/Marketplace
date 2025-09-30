"use client";
import { useState } from 'react'
import PropTypes from 'prop-types'
import { useRouter } from 'next/navigation'
import { useSignMessage } from 'wagmi'
import { authenticateLabAccess, getAuthErrorMessage } from '@/utils/auth/labAuth'
import devLog from '@/utils/dev/logger'

/**
 * Lab access component that provides entry controls for booked labs
 * Validates user booking status and provides access credentials/links
 * @param {Object} props
 * @param {string|number} props.id - Lab ID to provide access for
 * @param {string} props.userWallet - User's wallet address
 * @param {boolean} props.hasActiveBooking - Whether user has an active booking
 * @param {string} props.auth - Authentication method required for access
 * @returns {JSX.Element} Lab access interface with validation and entry controls
 */
export default function LabAccess({ id, userWallet, hasActiveBooking, auth }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();

  devLog.log(`🔐 LabAccess component - Lab ${id} auth endpoint:`, auth);

  const handleAccess = async () => {
    setLoading(true);
    setErrorMessage(null);
    
    try {
      // Use helper function to handle the complete authentication flow
      const authResult = await authenticateLabAccess(auth, userWallet, id, signMessageAsync);

      // Handle successful authentication
      if (authResult.token && authResult.labURL) {
        devLog.log('🚀 Lab access granted, redirecting to:', authResult.labURL);
        router.push(authResult.labURL + `?jwt=${authResult.token}`);
      } else if (authResult.error) {
        // Handle authentication errors returned by the service
        setErrorMessage(authResult.error);
        setTimeout(() => setErrorMessage(null), 1500);
      } else {
        // Handle unexpected response format
        setErrorMessage("Unexpected error, please try again.");
        setTimeout(() => setErrorMessage(null), 1500);
      }
      
    } catch (error) {
      // Handle authentication process errors
      const userFriendlyMessage = getAuthErrorMessage(error);
      setErrorMessage(userFriendlyMessage);
      setTimeout(() => setErrorMessage(null), 1500);
    } finally {
      setLoading(false);
    }
  };

  if (!hasActiveBooking) {
    return <div />;
  }

  return (
    <div onClick={handleAccess} className="text-center">
      {/* Show the error message */}
      {errorMessage && ( 
        <div className={`fixed z-20 top-1/2 left-1/2 p-4 w-3/4 -translate-x-1/2 
          -translate-y-1/2 bg-brand text-white rounded-lg shadow-lg opacity-85`}>
            {errorMessage}
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-brand/75 
        opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-white text-lg 
        font-bold cursor-pointer z-10">
          <div className="absolute inset-0 flex items-center justify-center transition-transform 
            duration-300 hover:scale-110" style={{ bottom: '-15%' }}>
            <div className={`text-white px-4 py-2 rounded mt-3`}
              disabled={loading}>
              {loading ? "Verifying..." : "Access"}
            </div>
          </div>
      </div>
    </div>
  );
}

LabAccess.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  userWallet: PropTypes.string.isRequired,
  hasActiveBooking: PropTypes.bool.isRequired,
  auth: PropTypes.string
}

LabAccess.defaultProps = {
  auth: ''
}
