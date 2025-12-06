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
import devLog from '@/utils/dev/logger'
import { transformAssertionOptions, assertionToJSON } from '@/utils/webauthn/client'
import { ACTION_CODES } from '@/utils/intents/signInstitutionalActionIntent'
import { useGetIsSSO } from '@/utils/hooks/getIsSSO'

async function runActionIntent(action, payload) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('WebAuthn not supported in this environment');
  }

  const prepareResponse = await fetch('/api/gateway/intents/actions/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action, payload, gatewayUrl: payload.gatewayUrl }),
  });

  const prepareData = await prepareResponse.json();
  if (!prepareResponse.ok) {
    throw new Error(prepareData.error || `Failed to prepare action intent: ${prepareResponse.status}`);
  }

  const publicKey = transformAssertionOptions({
    challenge: prepareData.webauthnChallenge,
    allowCredentials: prepareData.allowCredentials || [],
    userVerification: 'required',
    timeout: 90_000,
  });

  if (!publicKey) {
    throw new Error('Unable to build WebAuthn request options');
  }

  const assertion = await navigator.credentials.get({ publicKey });
  const assertionPayload = assertionToJSON(assertion);

  const finalizeResponse = await fetch('/api/gateway/intents/actions/finalize', {
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
      gatewayUrl: payload.gatewayUrl,
    }),
  });

  const finalizeData = await finalizeResponse.json();
  if (!finalizeResponse.ok) {
    throw new Error(finalizeData.error || 'Failed to finalize action intent');
  }

  const requestId =
    finalizeData?.intent?.meta?.requestId ||
    prepareData?.intent?.meta?.requestId ||
    prepareData?.requestId;

  return {
    ...finalizeData,
    requestId,
    intent: finalizeData.intent || prepareData.intent,
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

      try {
        devLog.log('🎯 Optimistic booking added to cache:', optimisticBooking.id);

        const txHash = await reservationRequest([requestData.tokenId, requestData.start, requestData.end]);
        const normalizedHash = typeof txHash === 'bigint' ? txHash.toString() : txHash?.toString?.() ?? txHash;
        
        devLog.log('🔍 useReservationRequestWallet - Transaction Hash:', normalizedHash);
        return { hash: normalizedHash, optimisticId: optimisticBooking.id };
      } catch (error) {
        // Remove optimistic update on error
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
            queryClient.invalidateQueries({ queryKey: bookingQueryKeys.hasActiveBookingByToken(variables.tokenId) });
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

  return useMutation({
    mutationFn: async (requestData) => {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported in this environment');
      }

      const payload = {
        labId: requestData.tokenId ?? requestData.labId,
        start: requestData.start,
        timeslot: requestData.timeslot ?? requestData.duration ?? requestData.timeslotMinutes,
        gatewayUrl: requestData.gatewayUrl,
      }

      const prepareResponse = await fetch('/api/gateway/intents/reservations/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const prepareData = await prepareResponse.json()
      if (!prepareResponse.ok) {
        throw new Error(prepareData.error || `Failed to prepare reservation intent: ${prepareResponse.status}`)
      }

      const publicKey = transformAssertionOptions({
        challenge: prepareData.webauthnChallenge,
        allowCredentials: prepareData.allowCredentials || [],
        userVerification: 'required',
        timeout: 90_000,
      })

      if (!publicKey) {
        throw new Error('Unable to build WebAuthn request options')
      }

      const assertion = await navigator.credentials.get({ publicKey })
      const assertionPayload = assertionToJSON(assertion)

      const finalizeResponse = await fetch('/api/gateway/intents/reservations/finalize', {
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
          gatewayUrl: payload.gatewayUrl,
        }),
      })

      const finalizeData = await finalizeResponse.json()
      if (!finalizeResponse.ok) {
        throw new Error(finalizeData.error || 'Failed to finalize reservation intent')
      }

      const requestId =
        finalizeData?.intent?.meta?.requestId ||
        prepareData?.intent?.meta?.requestId ||
        prepareData?.requestId

      return {
        ...finalizeData,
        requestId,
        intent: finalizeData.intent || prepareData.intent,
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

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId);
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

// Institutional SSO path reuses the same reservation intent flow (SAML + PUC + schacHomeOrganization)
export const useInstitutionalReservationRequestSSO = (options = {}) =>
  useReservationRequestSSO(options)

// Router wrapper: SSO path only; wallet path does not apply to institutional flows
export const useInstitutionalReservationRequest = (options = {}) => {
  const isSSO = useGetIsSSO(options)
  return useInstitutionalReservationRequestSSO({
    ...options,
    enabled: isSSO && (options.enabled ?? true),
  })
}
/**
 * Unified Hook for creating reservation requests (auto-detects SSO vs Wallet)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequest = (options = {}) => {
  const { isSSO } = useUser();
  
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

  return useMutation({
    mutationFn: async (reservationKey) => {
      const data = await runActionIntent(ACTION_CODES.CANCEL_REQUEST_BOOKING, {
        reservationKey,
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
        updateBooking(reservationKey, {
          reservationKey,
          intentRequestId: intentId,
          intentStatus: 'requested-cancel',
          isIntentPending: true,
          status: 'cancel-requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, { signal: abortController.signal });
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
              } else if (status === 'failed' || status === 'rejected') {
                updateBooking(reservationKey, {
                  reservationKey,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });
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
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('Failed to cancel reservation request via SSO:', error);
    },
    ...options,
  });
};
export const useCancelReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelReservationRequest } = useContractWriteFunction('cancelReservationRequest');

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
            status: '4', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Reservation request marked as cancelled in cache via wallet (optimistic update)');
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
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
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useCancelReservationRequestSSO(options);
  const walletMutation = useCancelReservationRequestWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

// ===== Institutional cancellation of reservation requests =====

export const useCancelInstitutionalReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { invalidateAllBookings, updateBooking } = useBookingCacheUpdates();
  const [abortController] = [new AbortController()];

  return useMutation({
    mutationFn: async (reservationKey) => {
      const data = await runActionIntent(ACTION_CODES.CANCEL_INSTITUTIONAL_REQUEST_BOOKING, {
        reservationKey,
      });
      devLog.log('useCancelInstitutionalReservationRequestSSO intent (webauthn):', data);
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

        updateBooking(reservationKey, {
          reservationKey,
          intentRequestId: intentId,
          intentStatus: 'requested-cancel',
          isIntentPending: true,
          status: 'cancel-requested',
          note: 'Requested to institution',
          timestamp: new Date().toISOString(),
        });

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, { signal: abortController.signal });
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
              } else if (status === 'failed' || status === 'rejected') {
                updateBooking(reservationKey, {
                  reservationKey,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err) {
              devLog.error('Polling cancel institutional reservation request intent failed:', err);
              queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
              invalidateAllBookings();
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to mark institutional cancel intent in cache, invalidating:', error);
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
        invalidateAllBookings();
      }
    },
    onError: (error, reservationKey) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('Failed to cancel institutional reservation request via SSO:', error);
    },
    ...options,
  });
};

export const useCancelInstitutionalReservationRequestWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelInstitutionalReservationRequest } = useContractWriteFunction('cancelInstitutionalReservationRequest');

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await cancelInstitutionalReservationRequest([reservationKey]);
      devLog.log('🔍 useCancelInstitutionalReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '4',
            isCancelled: true,
          },
        };
      });
      devLog.log('✅ Institutional reservation request marked as cancelled in cache via wallet');
    },
    onError: (error, reservationKey) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel institutional reservation request via wallet - reverting optimistic update:', error);
    },
    ...options,
  });
};

export const useCancelInstitutionalReservationRequest = (options = {}) => {
  const { isSSO } = useUser();

  const ssoMutation = useCancelInstitutionalReservationRequestSSO(options);
  const walletMutation = useCancelInstitutionalReservationRequestWallet(options);

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

  return useMutation({
    mutationFn: async (reservationKey) => {
      const data = await runActionIntent(ACTION_CODES.CANCEL_BOOKING, {
        reservationKey,
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
            status: '4', // Cancelled status
            isCancelled: true
          }
        };
      });

      try {
        const intentId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId);
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
                      status: '4',
                    },
                  };
                });
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
            status: '4', // Cancelled status
            isCancelled: true
          }
        };
      });
      devLog.log('✅ Booking marked as cancelled via wallet (optimistic update)');
    },
    onError: (error, reservationKey) => {
      // Revert optimistic update on error
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
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useCancelBookingSSO(options);
  const walletMutation = useCancelBookingWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

// ===== Institutional booking cancellation =====

export const useCancelInstitutionalBookingSSO = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationKey) => {
      const data = await runActionIntent(ACTION_CODES.CANCEL_INSTITUTIONAL_BOOKING, {
        reservationKey,
      });
      devLog.log('useCancelInstitutionalBookingSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (data, reservationKey) => {
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '4',
            isCancelled: true,
          },
        };
      });

      try {
        const intentId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();

        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId);
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
                      status: '4',
                    },
                  };
                });
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
              }
            } catch (err) {
              devLog.error('Polling cancel institutional booking intent failed:', err);
              queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to track cancel institutional booking intent:', error);
      }
    },
    onError: (error, reservationKey) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('Failed to cancel institutional booking via SSO - reverting optimistic update:', error);
    },
    ...options,
  });
};

export const useCancelInstitutionalBookingWallet = (options = {}) => {
  const queryClient = useQueryClient();
  const { contractWriteFunction: cancelInstitutionalBooking } = useContractWriteFunction('cancelInstitutionalBooking');

  return useMutation({
    mutationFn: async (reservationKey) => {
      const txHash = await cancelInstitutionalBooking([reservationKey]);
      devLog.log('🔍 useCancelInstitutionalBookingWallet - Transaction Hash:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result, reservationKey) => {
      queryClient.setQueryData(bookingQueryKeys.byReservationKey(reservationKey), (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          reservation: {
            ...oldData.reservation,
            status: '4',
            isCancelled: true,
          },
        };
      });
      devLog.log('✅ Institutional booking marked as cancelled via wallet (optimistic update)');
    },
    onError: (error, reservationKey) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      devLog.error('❌ Failed to cancel institutional booking via wallet - reverting optimistic update:', error);
    },
    ...options,
  });
};

export const useCancelInstitutionalBooking = (options = {}) => {
  const { isSSO } = useUser();

  const ssoMutation = useCancelInstitutionalBookingSSO(options);
  const walletMutation = useCancelInstitutionalBookingWallet(options);

  return isSSO ? ssoMutation : walletMutation;
};

/**
 * Requests funds for SSO users via WebAuthn + gateway action intent
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useRequestFundsSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { address } = useUser();

  return useMutation({
    mutationFn: async () => {
      const data = await runActionIntent(ACTION_CODES.REQUEST_FUNDS, {});
      devLog.log('useRequestFundsSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: () => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance(address || '') });
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
  const { address } = useUser();
  const { contractWriteFunction: requestFunds } = useContractWriteFunction('requestFunds');

  return useMutation({
    mutationFn: async () => {
      const txHash = await requestFunds([]);
      devLog.log('useRequestFundsWallet - tx sent:', txHash);
      return { hash: txHash };
    },
    onSuccess: (result) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance(address || '') });
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
  const { isSSO } = useUser();
  
  // Call both hooks unconditionally to follow rules of hooks
  const ssoMutation = useRequestFundsSSO(options);
  const walletMutation = useRequestFundsWallet(options);
  
  // Return the appropriate mutation
  return isSSO ? ssoMutation : walletMutation;
};

// Re-export cache updates utility
export { useBookingCacheUpdates } from './useBookingCacheUpdates';
