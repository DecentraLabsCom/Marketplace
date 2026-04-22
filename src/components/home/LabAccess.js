"use client";
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { useUser } from '@/context/UserContext'
import { useReservation } from '@/hooks/booking/useBookings'
import { authenticateLabAccessSSO, getAuthErrorMessage } from '@/utils/auth/labAuth'
import devLog from '@/utils/dev/logger'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

export function buildLabAccessUrl(labURL, token) {
  const redirectUrl = new URL(String(labURL || ''))
  redirectUrl.searchParams.set('jwt', String(token || ''))
  return redirectUrl.toString()
}

async function resolveActiveReservationKey(labId) {
  if (!labId && labId !== 0) {
    return null
  }

  const response = await fetch(
    `/api/contract/institution/getActiveReservationKey?labId=${encodeURIComponent(String(labId))}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to resolve active reservation key. Status: ${response.status}`)
  }

  const data = await response.json()
  const resolvedReservationKey = data?.reservationKey

  if (!resolvedReservationKey || resolvedReservationKey === ZERO_BYTES32) {
    return null
  }

  return resolvedReservationKey
}

/**
 * Lab access component that provides entry controls for booked labs
 * Validates user booking status and provides access credentials/links
 * @param {Object} props
 * @param {string|number} props.id - Lab ID to provide access for
 * @param {boolean} props.hasActiveBooking - Whether user has an active booking
 * @param {string} [props.reservationKey] - Optional reservation key for optimized validation
 * @returns {JSX.Element} Lab access interface with validation and entry controls
 */
export default function LabAccess({ id, hasActiveBooking, reservationKey = null }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [authURI, setAuthURI] = useState(null);
  const [fetchingAuth, setFetchingAuth] = useState(false);
  const { isSSO } = useUser();
  const { data: reservationData, isFetching: isFetchingReservation } = useReservation(reservationKey, {
    enabled: !!reservationKey && !!hasActiveBooking,
    staleTime: 60 * 1000,
    refetchOnMount: 'always',
  });

  const isReservationInUse =
    reservationData?.reservation?.isInUse === true ||
    Number(reservationData?.reservation?.status) === 2;
  const waitingReservationState = !!reservationKey && !!hasActiveBooking && !!isFetchingReservation;

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
    
    if (!isSSO) {
      setErrorMessage('Institutional login is required to access this lab.');
      setTimeout(() => setErrorMessage(null), 1500);
      setLoading(false);
      return;
    }

    // Validate auth endpoint before attempting authentication
    if (!authURI || authURI === '') {
      devLog.error('❌ Missing auth endpoint for lab:', id);
      setErrorMessage('This lab does not have authentication configured. Please contact the lab provider.');
      setTimeout(() => setErrorMessage(null), 3000);
      setLoading(false);
      return;
    }

    try {
      let resolvedReservationKey = reservationKey
      if (!resolvedReservationKey && hasActiveBooking) {
        resolvedReservationKey = await resolveActiveReservationKey(id)
        if (resolvedReservationKey) {
          devLog.log(`🔑 LabAccess - Resolved active reservationKey for lab ${id}:`, resolvedReservationKey)
        } else {
          devLog.warn(`⚠️ LabAccess - No active reservationKey resolved for lab ${id}; falling back to labId-only access`)
        }
      }

      // Use helper function to handle the complete authentication flow
      // Pass reservationKey if available for optimized validation
      const authResult = await authenticateLabAccessSSO({
        labId: id,
        reservationKey: resolvedReservationKey,
        authEndpoint: authURI,
        skipCheckIn: Boolean(resolvedReservationKey) && isReservationInUse,
      });

      // Handle successful authentication
      if (authResult.token && authResult.labURL) {
        devLog.log('🚀 Lab access granted, redirecting to:', authResult.labURL);
        // Prefer assign to avoid replacing history unexpectedly during tests
        window.location.assign(buildLabAccessUrl(authResult.labURL, authResult.token));
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
    <div className="text-center">
      {/* Show the error message */}
      {errorMessage && ( 
        <div
          role="alert"
          aria-live="assertive"
          className={`fixed z-20 top-1/2 left-1/2 p-4 w-3/4 -translate-x-1/2 
            -translate-y-1/2 bg-brand text-white rounded-lg shadow-lg opacity-85`}
        >
          {errorMessage}
        </div>
      )}
      <button
        type="button"
        onClick={handleAccess}
        disabled={loading || fetchingAuth || waitingReservationState}
        aria-busy={loading || fetchingAuth || waitingReservationState}
        className="absolute bottom-0 inset-x-0 h-1/3 bg-brand/75 
          opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-300 text-white text-lg 
          font-bold cursor-pointer z-10 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span
          className="absolute inset-0 flex items-center justify-center transition-transform 
            duration-300 hover:scale-110"
          style={{ bottom: '-15%' }}
        >
            <span className="text-white px-4 py-2 rounded mt-3">
            {(loading || waitingReservationState) ? "Verifying..." : "Access"}
          </span>
        </span>
      </button>
    </div>
  );
}

LabAccess.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  hasActiveBooking: PropTypes.bool.isRequired,
  reservationKey: PropTypes.string
}
