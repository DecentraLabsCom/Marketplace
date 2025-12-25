"use client";
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useSignMessage, useSignTypedData } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { authenticateLabAccess, authenticateLabAccessSSO, getAuthErrorMessage } from '@/utils/auth/labAuth'
import devLog from '@/utils/dev/logger'

/**
 * Lab access component that provides entry controls for booked labs
 * Validates user booking status and provides access credentials/links
 * @param {Object} props
 * @param {string|number} props.id - Lab ID to provide access for
 * @param {string} props.userWallet - User's wallet address
 * @param {boolean} props.hasActiveBooking - Whether user has an active booking
 * @param {string} [props.reservationKey] - Optional reservation key for optimized validation
 * @returns {JSX.Element} Lab access interface with validation and entry controls
 */
export default function LabAccess({ id, userWallet, hasActiveBooking, reservationKey = null }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [authURI, setAuthURI] = useState(null);
  const [fetchingAuth, setFetchingAuth] = useState(false);
  const { isSSO } = useUser();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();

  // Fetch authURI when component mounts or lab ID changes
  useEffect(() => {
    const fetchAuthURI = async () => {
      if (!id) return;
      
      setFetchingAuth(true);
      try {
        const response = await fetch(`/api/contract/lab/getLabAuthURI?labId=${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch auth URI');
        }
        const data = await response.json();
        setAuthURI(data.authURI);
        devLog.log(`🔐 LabAccess - Fetched authURI for lab ${id}:`, data.authURI);
      } catch (error) {
        devLog.error('❌ Error fetching authURI:', error);
        setAuthURI('');
      } finally {
        setFetchingAuth(false);
      }
    };

    fetchAuthURI();
  }, [id]);

  const handleAccess = async () => {
    setLoading(true);
    setErrorMessage(null);
    
    // Validate auth endpoint before attempting authentication
    if (!authURI || authURI === '') {
      devLog.error('❌ Missing auth endpoint for lab:', id);
      setErrorMessage('This lab does not have authentication configured. Please contact the lab provider.');
      setTimeout(() => setErrorMessage(null), 3000);
      setLoading(false);
      return;
    }

    if (!isSSO && !userWallet) {
      setErrorMessage('Please connect your wallet to access this lab.');
      setTimeout(() => setErrorMessage(null), 1500);
      setLoading(false);
      return;
    }

    try {
      // Use helper function to handle the complete authentication flow
      // Pass reservationKey if available for optimized validation
      const authResult = isSSO
        ? await authenticateLabAccessSSO({
            labId: id,
            reservationKey,
            authEndpoint: authURI,
          })
        : await authenticateLabAccess(
            authURI,
            userWallet,
            id,
            signMessageAsync,
            reservationKey,
            { signTypedDataAsync }
          );

      // Handle successful authentication
      if (authResult.token && authResult.labURL) {
        devLog.log('🚀 Lab access granted, redirecting to:', authResult.labURL);
        // Prefer assign to avoid replacing history unexpectedly during tests
        window.location.assign(authResult.labURL + `?jwt=${authResult.token}`);
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
      const userFriendlyMessage = getAuthErrorMessage(error, isSSO);
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
  userWallet: PropTypes.string,
  hasActiveBooking: PropTypes.bool.isRequired,
  reservationKey: PropTypes.string
}
