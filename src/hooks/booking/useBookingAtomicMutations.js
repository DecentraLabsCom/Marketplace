"use client";
/**
 * Atomic React Query Hooks for Booking-related Write Operations
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/reservation/
 * Handles mutations (create, update, delete operations)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { useBookingCacheUpdates } from './useBookingCacheUpdates'
import pollIntentStatus from '@/utils/intents/pollIntentStatus'
import pollIntentAuthorizationStatus from '@/utils/intents/pollIntentAuthorizationStatus'
import devLog from '@/utils/dev/logger'
import { transformAssertionOptions, assertionToJSON } from '@/utils/webauthn/client'
import { ACTION_CODES } from '@/utils/intents/signInstitutionalActionIntent'
import { useGetIsSSO } from '@/utils/hooks/getIsSSO'
import { useOptimisticUI } from '@/context/OptimisticUIContext'

const resolveBookingContext = (queryClient, reservationKey) => {
  if (!queryClient || !reservationKey) return {};
  const cached = queryClient.getQueryData(bookingQueryKeys.byReservationKey(reservationKey));
  const reservation = cached?.reservation || cached;
  return {
    labId: reservation?.labId ?? cached?.labId,
    userAddress: reservation?.renter ?? reservation?.userAddress ?? cached?.userAddress,
  };
};

const resolveIntentRequestId = (data) =>
  data?.requestId ||
  data?.intent?.meta?.requestId ||
  data?.intent?.requestId ||
  data?.intent?.request_id ||
  data?.intent?.requestId?.toString?.();

const normalizeAuthorizationUrl = (authorizationUrl, backendUrl) => {
  if (!authorizationUrl) return null;
  const raw = String(authorizationUrl).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    if (!backendUrl) return raw;
    try {
      const parsed = new URL(raw);
      const hostname = parsed.hostname.toLowerCase();
      const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0';

      if (hostname === 'intents' || (!hostname.includes('.') && !isLocal)) {
        let path = parsed.pathname || '';
        if (!path.startsWith('/intents')) {
          path = `/intents${path.startsWith('/') ? '' : '/'}${path}`;
        }
        return new URL(`${path}${parsed.search || ''}${parsed.hash || ''}`, backendUrl).toString();
      }

      return raw;
    } catch {
      return raw;
    }
  }
  const normalized = raw.startsWith('//') ? raw.replace(/^\/+/, '/') : raw;
  if (backendUrl) {
    try {
      return new URL(normalized, backendUrl).toString();
    } catch {
      // fall through
    }
  }
  return normalized;
};

const resolveAuthorizationInfo = (prepareData, backendUrl) => ({
  authorizationUrl: normalizeAuthorizationUrl(
    prepareData?.authorizationUrl || prepareData?.ceremonyUrl || null,
    prepareData?.backendUrl || backendUrl
  ),
  authorizationSessionId: prepareData?.authorizationSessionId || prepareData?.sessionId || null,
});

const openAuthorizationPopup = (authorizationUrl, popup) => {
  if (!authorizationUrl) return null;

  let authPopup = popup && !popup.closed ? popup : null;
  if (!authPopup) {
    authPopup = window.open(
      authorizationUrl,
      'intent-authorization',
      'width=480,height=720'
    );
  }

  if (authPopup) {
    try {
      authPopup.opener = null;
      authPopup.focus();
    } catch {
      // ignore opener errors
    }
  }

  return authPopup;
};

const openAuthorizationPopupFallback = (authorizationUrl) => {
  if (!authorizationUrl) return null;
  const fallback = window.open(
    authorizationUrl,
    'intent-authorization',
    'width=480,height=720'
  );
  if (fallback) {
    try {
      fallback.opener = null;
    } catch {
      // ignore opener errors
    }
  }
  return fallback;
};

async function awaitBackendAuthorization(prepareData, { backendUrl, authToken, popup } = {}) {
  const { authorizationUrl, authorizationSessionId } = resolveAuthorizationInfo(prepareData, backendUrl);
  if (!authorizationUrl || !authorizationSessionId) {
    try {
      if (popup && !popup.closed) {
        popup.close();
      }
    } catch {
      // ignore close errors
    }
    return null;
  }

  let authPopup = openAuthorizationPopup(authorizationUrl, popup);
  if (!authPopup) {
    authPopup = openAuthorizationPopupFallback(authorizationUrl);
  }
  if (!authPopup) {
    throw new Error('Authorization window was blocked');
  }

  const status = await pollIntentAuthorizationStatus(authorizationSessionId, {
    backendUrl: prepareData?.backendUrl || backendUrl,
    authToken: authToken || prepareData?.backendAuthToken,
  });

  const normalized = (status?.status || '').toUpperCase();
  if (normalized === 'FAILED') {
    throw new Error(status?.error || 'Intent authorization failed');
  }

  try {
    if (!authPopup.closed) {
      authPopup.close();
    }
  } catch {
    // ignore close errors
  }

  return status;
}

async function runActionIntent(action, payload) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('WebAuthn not supported in this environment');
  }

  const prepareResponse = await fetch('/api/backend/intents/actions/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action, payload, backendUrl: payload.backendUrl }),
  });

  const prepareData = await prepareResponse.json();
  if (!prepareResponse.ok) {
    throw new Error(prepareData.error || `Failed to prepare action intent: ${prepareResponse.status}`);
  }

  const authToken = prepareData?.backendAuthToken || null;
  const authorizationStatus = await awaitBackendAuthorization(prepareData, {
    backendUrl: payload.backendUrl,
    authToken,
  });
  if (authorizationStatus) {
    const requestId = authorizationStatus?.requestId || resolveIntentRequestId(prepareData);
    return {
      ...prepareData,
      requestId,
      intent: prepareData.intent,
      authorization: authorizationStatus,
      backendAuthToken: authToken,
      backendAuthExpiresAt: prepareData?.backendAuthExpiresAt || null,
    };
  }

  const publicKey = transformAssertionOptions({
    challenge: prepareData.webauthnChallenge,
    allowCredentials: prepareData.allowCredentials || [],
    rpId: prepareData.webauthnRpId || undefined,
    userVerification: 'required',
    timeout: 90_000,
  });

  if (!publicKey) {
    throw new Error('Unable to build WebAuthn request options');
  }

  const assertion = await navigator.credentials.get({ publicKey });
  const assertionPayload = assertionToJSON(assertion);

  const finalizeResponse = await fetch('/api/backend/intents/actions/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      meta: prepareData.intent?.meta,
      payload: prepareData.intent?.payload,
      adminSignature: prepareData.adminSignature,
      webauthnCredentialId: prepareData.webauthnCredentialId,
      webauthnClientDataJSON: assertionPayload?.response?.clientDataJSON,
      webauthnAuthenticatorData: assertionPayload?.response?.authenticatorData,
      webauthnSignature: assertionPayload?.response?.signature,
      backendUrl: payload.backendUrl,
    }),
  });

  const finalizeData = await finalizeResponse.json();
  if (!finalizeResponse.ok) {
    throw new Error(finalizeData.error || 'Failed to finalize action intent');
  }

  const requestId =
    finalizeData?.intent?.meta?.requestId ||
    resolveIntentRequestId(prepareData);

  const finalizeAuthToken = finalizeData?.backendAuthToken || authToken;
  const finalizeAuthExpiresAt = finalizeData?.backendAuthExpiresAt || prepareData?.backendAuthExpiresAt || null;

  return {
    ...finalizeData,
    requestId,
    intent: finalizeData.intent || prepareData.intent,
    backendAuthToken: finalizeAuthToken,
    backendAuthExpiresAt: finalizeAuthExpiresAt,
  };
}

// ===== MUTATIONS =====

/**
 * Hook for /api/contract/reservation/reservationRequest endpoint using wallet (non-SSO users)  
 * Creates a new reservation request using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { addOptimisticBooking, replaceOptimisticBooking, removeOptimisticBooking, invalidateAllBookings } = useBookingCacheUpdates();
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest');
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async (requestData) => {
      // **NEW: Add optimistic booking for immediate UI feedback**
      const optimisticBooking = addOptimisticBooking({
        tokenId: requestData.tokenId,
        labId: requestData.tokenId,
        start: requestData.start,
        end: requestData.end,
        userAddress: requestData.userAddress || 'unknown',
        status: 'requesting'
      });

      // Set optimistic UI state for the booking (keyed by optimistic id)
      try {
        setOptimisticBookingState(optimisticBooking.id, {
          status: 'requesting',
          isPending: true,
          isInstitutional: false,
          labId: requestData.tokenId,
          userAddress: requestData.userAddress || 'unknown',
        });
      } catch (err) {
        devLog.warn('Failed to set optimistic booking state (non-fatal):', err);
      }

      try {
        devLog.log('🎯 Optimistic booking added to cache:', optimisticBooking.id);

        const txHash = await reservationRequest([requestData.tokenId, requestData.start, requestData.end]);
        const normalizedHash = typeof txHash === 'bigint' ? txHash.toString() : txHash?.toString?.() ?? txHash;
        
        devLog.log('🔍 useReservationRequestWallet - Transaction Hash:', normalizedHash);
        return { hash: normalizedHash, optimisticId: optimisticBooking.id };
      } catch (error) {
        // Remove optimistic update on error and clear optimistic UI state
        try {
          clearOptimisticBookingState(optimisticBooking.id);
        } catch (err) {
          devLog.warn('Failed to clear optimistic booking state after mutation error:', err);
        }
        removeOptimisticBooking(optimisticBooking.id);
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      // **NEW: Replace optimistic booking with transaction-pending version**
      try {
        const transactionPendingBooking = {
          ...variables,
          reservationKey: result.optimisticId, // Temporary until we get real key
          tokenId: variables.tokenId,
          labId: variables.tokenId,
          start: variables.start,
          end: variables.end,
          userAddress: variables.userAddress || 'unknown',
          status: 'pending',
          transactionHash: result.hash,
          isPending: true, // Still pending blockchain confirmation
          isProcessing: false, // No longer processing on client side
          timestamp: new Date().toISOString()
        };
        
        replaceOptimisticBooking(result.optimisticId, transactionPendingBooking);
        devLog.log('✅ Reservation request transaction sent via wallet, awaiting blockchain confirmation');

        try {
          completeOptimisticBookingState(result.optimisticId);
        } catch (err) {
          devLog.warn('Failed to complete optimistic booking state after tx sent:', err);
        }
      } catch (error) {
        devLog.error('Failed to update optimistic data, falling back to invalidation:', error);
        try {
          invalidateAllBookings();
        } catch (invalidateError) {
          devLog.error('invalidateAllBookings threw, continuing targeted invalidations', invalidateError);
        }

        if (variables.tokenId) {
          try {
            queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(variables.tokenId) });
            if (variables.userAddress) {
              queryClient.invalidateQueries({
                queryKey: bookingQueryKeys.hasActiveBookingByToken(variables.tokenId, variables.userAddress),
              });
            }
          } catch (targetedError) {
            devLog.error('Targeted booking invalidations failed', targetedError);
          }
        }
      }
    },
    onError: (error) => {
      devLog.error('❌ Failed to create reservation request via wallet:', error);
    },
    ...options,
  });
};

/**
 * Hook for /api/contract/reservation/reservationRequest endpoint
 * Creates a new reservation request for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateBooking, invalidateAllBookings } = useBookingCacheUpdates();
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async (requestData) => {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported in this environment');
      }

      const payload = {
        labId: requestData.tokenId ?? requestData.labId,
        start: requestData.start,
        timeslot: requestData.timeslot ?? requestData.duration ?? requestData.timeslotMinutes,
        backendUrl: requestData.backendUrl,
      }

      const prepareResponse = await fetch('/api/backend/intents/reservations/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const prepareData = await prepareResponse.json()
      if (!prepareResponse.ok) {
        throw new Error(prepareData.error || `Failed to prepare reservation intent: ${prepareResponse.status}`)
      }

      const authToken = prepareData?.backendAuthToken || null
      const authorizationStatus = await awaitBackendAuthorization(prepareData, {
        backendUrl: payload.backendUrl,
        authToken,
      })
      if (authorizationStatus) {
        const requestId = authorizationStatus?.requestId || resolveIntentRequestId(prepareData)
        return {
          ...prepareData,
          requestId,
          intent: prepareData.intent,
          authorization: authorizationStatus,
          backendAuthToken: authToken,
          backendAuthExpiresAt: prepareData?.backendAuthExpiresAt || null,
        }
      }

      const publicKey = transformAssertionOptions({
        challenge: prepareData.webauthnChallenge,
        allowCredentials: prepareData.allowCredentials || [],
        rpId: prepareData.webauthnRpId || undefined,
        userVerification: 'required',
        timeout: 90_000,
      })

      if (!publicKey) {
        throw new Error('Unable to build WebAuthn request options')
      }

      const assertion = await navigator.credentials.get({ publicKey })
      const assertionPayload = assertionToJSON(assertion)

      const finalizeResponse = await fetch('/api/backend/intents/reservations/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          meta: prepareData.intent?.meta,
          payload: prepareData.intent?.payload,
          adminSignature: prepareData.adminSignature,
          webauthnCredentialId: prepareData.webauthnCredentialId,
          webauthnClientDataJSON: assertionPayload?.response?.clientDataJSON,
          webauthnAuthenticatorData: assertionPayload?.response?.authenticatorData,
          webauthnSignature: assertionPayload?.response?.signature,
          backendUrl: payload.backendUrl,
        }),
      })

      const finalizeData = await finalizeResponse.json()
      if (!finalizeResponse.ok) {
        throw new Error(finalizeData.error || 'Failed to finalize reservation intent')
      }

      const requestId =
        finalizeData?.intent?.meta?.requestId ||
        resolveIntentRequestId(prepareData)
      const finalizeAuthToken = finalizeData?.backendAuthToken || prepareData?.backendAuthToken || null
      const finalizeAuthExpiresAt = finalizeData?.backendAuthExpiresAt || prepareData?.backendAuthExpiresAt || null

      return {
        ...finalizeData,
        requestId,
        intent: finalizeData.intent || prepareData.intent,
        backendAuthToken: finalizeAuthToken,
        backendAuthExpiresAt: finalizeAuthExpiresAt,
      }
    },
    onSuccess: (data, variables) => {
      try {
        const intentId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();
        const reservationKey = intentId || `intent-${Date.now()}`;
        const authToken = data?.backendAuthToken;

        updateBooking(reservationKey, {
          reservationKey,
          labId: variables.tokenId,
          start: variables.start,
          end: variables.end,
          isIntentPending: true,
          intentRequestId: intentId,
          intentStatus: 'requested',
          status: 'requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        try {
          setOptimisticBookingState(reservationKey, {
            status: 'requested',
            isPending: true,
            isInstitutional: true,
            labId: variables.tokenId,
            userAddress: variables.userAddress || 'unknown',
          });
        } catch (err) {
          devLog.warn('Failed to set optimistic booking state for SSO reservation:', err);
        }

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, { authToken });
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;
              const finalKey = result?.reservationKey || reservationKey;

              if (status === 'executed') {
                        updateBooking(finalKey, {
                  reservationKey: finalKey,
                  labId: variables.tokenId,
                  start: variables.start,
                  end: variables.end,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  status: 'pending',
                  transactionHash: txHash,
                  note: 'Executed by institution',
                  timestamp: new Date().toISOString(),
                });

                try {
                  completeOptimisticBookingState(finalKey);
                } catch (err) {
                  devLog.warn('Failed to complete optimistic booking state after intent executed:', err);
                }
              } else if (status === 'failed' || status === 'rejected') {
                updateBooking(finalKey, {
                  reservationKey: finalKey,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err) {
              devLog.error('ƒ?O Polling reservation intent failed:', err);
              queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
              invalidateAllBookings();
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to mark reservation intent, falling back to invalidation:', error);
        invalidateAllBookings();
      }
    },
    onError: (error) => {
      devLog.error('ƒ?O Failed to create SSO reservation request:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for creating reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequest = (options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useReservationRequestSSO(options);
  const walletMutation = useReservationRequestWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Hook for /api/contract/reservation/cancelReservationRequest endpoint using server wallet (SSO users)
 * Cancels a reservation request using server wallet for SSO users
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { invalidateAllBookings, updateBooking } = useBookingCacheUpdates();
  const [abortController] = [new AbortController()];
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();
  const { institutionBackendUrl } = useUser();

  return useMutation({
    mutationFn: async (reservationKey) => {
      if (!institutionBackendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      const data = await runActionIntent(ACTION_CODES.CANCEL_REQUEST_BOOKING, {
        reservationKey,
        backendUrl: institutionBackendUrl,
      });
      devLog.log('useCancelReservationRequestSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      try {
        const intentId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();
        const authToken = data?.backendAuthToken;
        updateBooking(reservationKey, {
          reservationKey,
          intentRequestId: intentId,
          intentStatus: 'requested-cancel',
          isIntentPending: true,
          status: 'cancel-requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        try {
          const { labId, userAddress } = resolveBookingContext(queryClient, reservationKey);
          setOptimisticBookingState(reservationKey, {
            status: 'cancel-requested',
            isPending: true,
            isInstitutional: true,
            labId,
            userAddress,
          });
        } catch (err) {
          devLog.warn('Failed to set optimistic booking state for SSO cancel request:', err);
        }

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, {
                authToken,
                signal: abortController.signal,
              });
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                updateBooking(reservationKey, {
                  reservationKey,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  status: 'cancelled',
                  transactionHash: txHash,
                  note: 'Cancelled by institution',
                  timestamp: new Date().toISOString(),
                });

                try {
                  completeOptimisticBookingState(reservationKey);
                } catch (err) {
                  devLog.warn('Failed to complete optimistic booking state after cancel executed:', err);
                }
              } else if (status === 'failed' || status === 'rejected') {
                updateBooking(reservationKey, {
                  reservationKey,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });

                try {
                  clearOptimisticBookingState(reservationKey);
                } catch (err) {
                  devLog.warn('Failed to clear optimistic booking state after cancel failed:', err);
                }
              }
            } catch (err) {
              devLog.error('Polling cancel intent failed:', err);
              queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
              invalidateAllBookings();
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to mark cancel intent in cache, invalidating:', error);
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
        invalidateAllBookings();
      }
    },
    onError: (error, reservationKey) => {
      try {
        clearOptimisticBookingState(reservationKey);
      } catch (err) {
        devLog.warn('Failed to clear optimistic booking state on SSO cancel error:', err);
      }
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('Failed to cancel reservation request via SSO:', error);
    },
    ...options,
  });
};
export const useCancelReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelReservationRequest } = useContractWriteFunction('cancelReservationRequest');
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await cancelReservationRequest([reservationKey]);
      
      devLog.log('🔍 useCancelReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      // Optimistic update: mark reservation as cancelled in cache to remove from UI immediately
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '5', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Reservation request marked as cancelled in cache via wallet (optimistic update)');

      // Optimistic UI: set cancelling state and complete it after tx sent
      try {
        const { labId, userAddress } = resolveBookingContext(queryClient, reservationKey);
        setOptimisticBookingState(reservationKey, {
          status: 'cancelling',
          isPending: true,
          isInstitutional: false,
          labId,
          userAddress,
        });
        completeOptimisticBookingState(reservationKey);
      } catch (err) {
        devLog.warn('Failed to set/complete optimistic booking state for cancellation (non-fatal):', err);
      }
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      try {
        clearOptimisticBookingState(reservationKey);
      } catch (err) {
        devLog.warn('Failed to clear optimistic booking state on cancel error:', err);
      }
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel reservation request via wallet - reverting optimistic update:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for cancelling reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequest = (options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useCancelReservationRequestSSO(options);
  const walletMutation = useCancelReservationRequestWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Hook for /api/contract/reservation/cancelBooking endpoint
 * Cancels an existing booking (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBookingSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();
  const { institutionBackendUrl } = useUser();

  return useMutation({
    mutationFn: async (reservationKey) => {
      if (!institutionBackendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      const data = await runActionIntent(ACTION_CODES.CANCEL_BOOKING, {
        reservationKey,
        backendUrl: institutionBackendUrl,
      });
      devLog.log('useCancelBookingSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '5', // Cancelled status
            isCancelled: true
          }
        };
      });

      try {
        try {
          const { labId, userAddress } = resolveBookingContext(queryClient, reservationKey);
          setOptimisticBookingState(reservationKey, {
            status: 'cancel-requested',
            isPending: true,
            isInstitutional: true,
            labId,
            userAddress,
          });
        } catch (err) {
          devLog.warn('Failed to set optimistic booking state for cancel booking SSO:', err);
        }

        const intentId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();
        const authToken = data?.backendAuthToken;

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, { authToken });
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
                  if (!oldData) return oldData;
                  return {
                    ...oldData,
                    reservation: {
                      ...oldData.reservation,
                      transactionHash: txHash,
                      isCancelled: true,
                      status: '5',
                    },
                  };
                });

                try {
                  completeOptimisticBookingState(reservationKey);
                } catch (err) {
                  devLog.warn('Failed to complete optimistic booking state after cancel booking executed:', err);
                }
              } else if (status === 'failed' || status === 'rejected') {
                queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
                  if (!oldData) return oldData;
                  return {
                    ...oldData,
                    reservation: {
                      ...oldData.reservation,
                      status: oldData.reservation?.status,
                      intentStatus: status,
                      intentError: reason,
                      note: reason || 'Rejected by institution',
                    },
                  };
                });

                try {
                  clearOptimisticBookingState(reservationKey);
                } catch (err) {
                  devLog.warn('Failed to clear optimistic booking state after cancel booking failed:', err);
                }
              }
            } catch (err) {
              devLog.error('Polling cancel booking intent failed:', err);
              queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to track cancel booking intent:', error);
      }
    },
    onError: (error, reservationKey) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('Failed to cancel booking via SSO - reverting optimistic update:', error);
    },
    ...options,
  });
};
export const useCancelBookingWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelBooking } = useContractWriteFunction('cancelBooking');
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await cancelBooking([reservationKey]);
      
      devLog.log('🔍 useCancelBookingWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      // Optimistic update: mark booking as cancelled in cache to remove from UI immediately
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '5', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Booking marked as cancelled via wallet (optimistic update)');

      try {
        const { labId, userAddress } = resolveBookingContext(queryClient, reservationKey);
        setOptimisticBookingState(reservationKey, {
          status: 'cancelling',
          isPending: true,
          isInstitutional: false,
          labId,
          userAddress,
        });
        completeOptimisticBookingState(reservationKey);
      } catch (err) {
        devLog.warn('Failed to set/complete optimistic booking state for booking cancellation (non-fatal):', err);
      }
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
      try {
        clearOptimisticBookingState(reservationKey);
      } catch (err) {
        devLog.warn('Failed to clear optimistic booking state on booking cancel error:', err);
      }
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel booking via wallet - reverting optimistic update:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for cancelling bookings (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBooking = (options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useCancelBookingSSO(options);
  const walletMutation = useCancelBookingWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Requests funds for SSO users via WebAuthn + backend action intent
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFundsSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { institutionBackendUrl } = useUser();

  return useMutation({
    mutationFn: async () => {
      if (!institutionBackendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      const data = await runActionIntent(ACTION_CODES.REQUEST_FUNDS, {
        backendUrl: institutionBackendUrl,
      });
      devLog.log('useRequestFundsSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: () => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance() });
      devLog.log('Funds requested successfully, cache invalidated');
    },
    onError: (error) => {
      devLog.error('Failed to request funds:', error);
    },
    ...options,
  });
};

/**
 * Hook for wallet-based requestFunds using useContractWriteFunction
 * Requests funds using user's wallet
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFundsWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: requestFunds } = useContractWriteFunction('requestFunds');

  return useMutation({
    mutationFn: async () => {
      const txHash = await requestFunds([]);
      devLog.log('useRequestFundsWallet - tx sent:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance() });
      devLog.log('Funds requested successfully via wallet, cache invalidated');
    },
    onError: (error) => {
      devLog.error('Failed to request funds via wallet:', error);
    },
    ...options,
  });
};

/**
 * Unified Hook for requesting funds (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFunds = (options = {}) => {
  const isSSO = useGetIsSSO(options);
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useRequestFundsSSO(options);
  const walletMutation = useRequestFundsWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

// Re-export cache updates utility
export { useBookingCacheUpdates } from './useBookingCacheUpdates';

