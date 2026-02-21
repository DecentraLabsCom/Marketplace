"use client";
/**
 * Atomic React Query Hooks for Booking-related Write Operations
 * Each hook maps 1:1 to a specific API endpoint in /api/contract/reservation/
 * Handles mutations (create, update, delete operations)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useUser } from '@/context/UserContext'
import { bookingQueryKeys, stakingQueryKeys } from '@/utils/hooks/queryKeys'
import { useBookingCacheUpdates } from './useBookingCacheUpdates'
import pollIntentStatus from '@/utils/intents/pollIntentStatus'
import {
  awaitIntentAuthorization,
  resolveAuthorizationStatusBaseUrl,
} from '@/utils/intents/authorizationOrchestrator'
import devLog from '@/utils/dev/logger'
import { ACTION_CODES } from '@/utils/intents/signInstitutionalActionIntent'
import { useGetIsSSO } from '@/utils/hooks/authMode'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { enqueueReconciliationEntry, removeReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'
import createPendingBookingPayload from './utils/createPendingBookingPayload'
import {
  resolveIntentRequestId,
  createIntentMutationError,
  createAuthorizationCancelledError,
  markBrowserCredentialVerifiedFromIntent,
} from '@/utils/intents/clientFlowShared'

const resolveBookingContext = (queryClient, reservationKey) => {
  if (!queryClient || !reservationKey) return {};
  const cached = queryClient.getQueryData(bookingQueryKeys.byReservationKey(reservationKey));
  const reservation = cached?.reservation || cached;
  return {
    labId: reservation?.labId ?? cached?.labId,
    userAddress: reservation?.renter ?? reservation?.userAddress ?? cached?.userAddress,
  };
};

const normalizeReservationMutationInput = (input) => {
  if (typeof input === 'string') {
    return { reservationKey: input };
  }
  if (input && typeof input === 'object') {
    return {
      reservationKey: input.reservationKey,
      labId: input.labId,
      price: input.price,
    };
  }
  return { reservationKey: null };
};

const resolveReservationSnapshotFromCache = (queryClient, reservationKey) => {
  if (!queryClient || !reservationKey) return {};
  const cached = queryClient.getQueryData(bookingQueryKeys.byReservationKey(reservationKey));
  const reservation = cached?.reservation || cached || {};
  return {
    labId: reservation?.labId,
    price: reservation?.price,
    userAddress: reservation?.renter ?? reservation?.userAddress,
  };
};

const invalidateInstitutionalReservationQueries = (queryClient, { labId, reservationKey } = {}) => {
  if (!queryClient) return;

  queryClient.invalidateQueries({ queryKey: bookingQueryKeys.ssoReservationsOf() });
  queryClient.invalidateQueries({
    queryKey: bookingQueryKeys.ssoReservationKeyOfUserPrefix(),
    exact: false,
  });

  if (labId !== undefined && labId !== null) {
    queryClient.invalidateQueries({ queryKey: bookingQueryKeys.getReservationsOfToken(labId) });
    queryClient.invalidateQueries({
      queryKey: bookingQueryKeys.reservationOfTokenPrefix(labId),
      exact: false,
    });
  }

  if (reservationKey) {
    queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
  }
};

const emitReservationProgress = (requestData, stage, details = {}) => {
  const onProgress = requestData?.onProgress;
  if (typeof onProgress !== 'function') return;
  try {
    onProgress({ stage, ...details });
  } catch (error) {
    devLog.warn('Reservation progress callback failed:', error);
  }
};

const awaitBackendAuthorization = async (prepareData, { backendUrl, authToken, popup, presenceFn } = {}) => {
  return awaitIntentAuthorization(prepareData, {
    backendUrl,
    authToken,
    popup,
    presenceFn,
    source: 'booking-intent-authorization',
    requestIdResolver: resolveIntentRequestId,
    resolveStatusBackendUrl: (authorizationUrl, currentPrepareData, currentBackendUrl) =>
      resolveAuthorizationStatusBaseUrl(
        authorizationUrl,
        currentPrepareData?.backendUrl || currentBackendUrl
      ),
    closePopupInFinally: true,
  })
}

const DEFAULT_REQUEST_FUNDS_MAX_BATCH = 100

const normalizeRequestFundsInput = (input, { fallbackBackendUrl } = {}) => {
  const payload = input && typeof input === 'object' ? input : {}
  const rawLabId = payload.labId ?? payload.tokenId ?? payload.id
  const parsedLabId = Number(rawLabId)

  if (!Number.isInteger(parsedLabId) || parsedLabId < 0) {
    throw new Error('Missing or invalid labId for requestFunds')
  }

  const rawMaxBatch = payload.maxBatch ?? DEFAULT_REQUEST_FUNDS_MAX_BATCH
  const parsedMaxBatch = Number(rawMaxBatch)
  if (!Number.isInteger(parsedMaxBatch) || parsedMaxBatch < 1 || parsedMaxBatch > 100) {
    throw new Error('Invalid maxBatch for requestFunds (expected integer 1-100)')
  }

  return {
    labId: parsedLabId,
    maxBatch: parsedMaxBatch,
    backendUrl: payload.backendUrl || fallbackBackendUrl || null,
  }
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
    throw createIntentMutationError(
      prepareData,
      `Failed to prepare action intent: ${prepareResponse.status}`
    );
  }

  const authToken = prepareData?.backendAuthToken || null;
  const authorizationStatus = await awaitBackendAuthorization(prepareData, {
    backendUrl: payload.backendUrl,
    authToken,
  });
  const authorizationRequestId =
    authorizationStatus?.requestId || resolveIntentRequestId(prepareData);
  if (authorizationStatus) {
    const normalizedStatus = (authorizationStatus.status || '').toUpperCase();
    if (normalizedStatus === 'FAILED') {
      throw new Error(authorizationStatus?.error || 'Intent authorization failed');
    }
    if (normalizedStatus === 'CANCELLED') {
      throw createAuthorizationCancelledError(authorizationStatus?.error || 'Authorization cancelled by user');
    }
    if (normalizedStatus === 'UNKNOWN' && !authorizationRequestId) {
      throw createAuthorizationCancelledError(authorizationStatus?.error || 'Authorization cancelled by user');
    }
    if (normalizedStatus === 'SUCCESS') {
      markBrowserCredentialVerifiedFromIntent(prepareData, { includeReservationPayload: true });
    }
  }
  if (authorizationStatus) {
    const requestId = authorizationRequestId;
    return {
      ...prepareData,
      requestId,
      intent: prepareData.intent,
      authorization: authorizationStatus,
      backendAuthToken: authToken,
      backendAuthExpiresAt: prepareData?.backendAuthExpiresAt || null,
    };
  }
  throw createAuthorizationCancelledError('Authorization session unavailable');
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
        const transactionPendingBooking = createPendingBookingPayload({
          ...variables,
          reservationKey: result.optimisticId, // Temporary until we get real key
          status: 'pending',
          transactionHash: result.hash,
          isOptimistic: true,
          isProcessing: false,
          extra: variables,
        });
        
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
  const { updateBooking, invalidateAllBookings, addBooking } = useBookingCacheUpdates();
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async (requestData) => {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported in this environment');
      }

      emitReservationProgress(requestData, 'preparing_intent');

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
        throw createIntentMutationError(
          prepareData,
          `Failed to prepare reservation intent: ${prepareResponse.status}`
        )
      }

      emitReservationProgress(requestData, 'intent_prepared');

      const authToken = prepareData?.backendAuthToken || null
      emitReservationProgress(requestData, 'awaiting_authorization');
      const authorizationStatus = await awaitBackendAuthorization(prepareData, {
        backendUrl: payload.backendUrl,
        authToken,
      })
      const authorizationRequestId =
        authorizationStatus?.requestId || resolveIntentRequestId(prepareData)
      if (authorizationStatus) {
        const normalizedStatus = (authorizationStatus.status || '').toUpperCase()
        if (normalizedStatus === 'FAILED') {
          throw new Error(authorizationStatus?.error || 'Intent authorization failed')
        }
        if (normalizedStatus === 'CANCELLED') {
          throw createAuthorizationCancelledError(authorizationStatus?.error || 'Authorization cancelled by user')
        }
        if (normalizedStatus === 'UNKNOWN' && !authorizationRequestId) {
          throw createAuthorizationCancelledError(authorizationStatus?.error || 'Authorization cancelled by user')
        }
        if (normalizedStatus === 'SUCCESS') {
          markBrowserCredentialVerifiedFromIntent(prepareData, { includeReservationPayload: true })
        }
      }
      if (authorizationStatus) {
        const requestId = authorizationRequestId
        emitReservationProgress(requestData, 'request_submitted', { requestId });
        return {
          ...prepareData,
          requestId,
          intent: prepareData.intent,
          authorization: authorizationStatus,
          backendAuthToken: authToken,
          backendAuthExpiresAt: prepareData?.backendAuthExpiresAt || null,
        }
      }
      throw createAuthorizationCancelledError('Authorization session unavailable')
    },
    onSuccess: (data, variables) => {
      try {
        const intentId =
          data?.requestId ||
          data?.intent?.meta?.requestId ||
          data?.intent?.requestId ||
          data?.intent?.request_id ||
          data?.intent?.requestId?.toString?.();
        const reservationKey =
          data?.intent?.payload?.reservationKey ||
          data?.intent?.payload?.reservation_key ||
          data?.intent?.reservationKey ||
          intentId ||
          `intent-${Date.now()}`;
        const authToken = data?.backendAuthToken;

        // Optimistic booking for lab calendars (SSO flow)
        try {
          addBooking(
            createPendingBookingPayload({
              ...variables,
              reservationKey,
              status: 'requested',
              intentRequestId: intentId,
              intentStatus: 'requested',
              note: 'Requested to institution',
              isOptimistic: true,
            })
          );
        } catch (err) {
          devLog.warn('Failed to add optimistic SSO booking for lab calendar:', err);
        }

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
              const result = await pollIntentStatus(intentId, { 
                authToken, 
                backendUrl: data?.backendUrl || variables.backendUrl 
              });
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

                // Invalidate user and lab booking queries so calendar and dashboard update
                // After institutional reservation is executed onchain, we need to refresh:
                // - User's reservation list (for dashboard)
                // - Lab's reservation list (for calendar)
                // - Active booking checks
                if (variables.userAddress) {
                  queryClient.invalidateQueries({ 
                    queryKey: bookingQueryKeys.reservationsOf(variables.userAddress) 
                  });
                  if (variables.tokenId) {
                    queryClient.invalidateQueries({
                      queryKey: bookingQueryKeys.hasActiveBookingByToken(variables.tokenId, variables.userAddress)
                    });
                  }
                }
                if (variables.tokenId) {
                  queryClient.invalidateQueries({ 
                    queryKey: bookingQueryKeys.getReservationsOfToken(variables.tokenId) 
                  });
                }
                if (finalKey) {
                  queryClient.invalidateQueries({
                    queryKey: bookingQueryKeys.byReservationKey(finalKey)
                  });
                }

                invalidateInstitutionalReservationQueries(queryClient, {
                  labId: variables.tokenId,
                  reservationKey: finalKey,
                });

                devLog.log('✅ Invalidated booking queries after institutional reservation executed:', {
                  finalKey,
                  userAddress: variables.userAddress,
                  tokenId: variables.tokenId
                });

                // Reservation confirmation now relies on BookingEventContext event polling only,
                // avoiding duplicate polling loops for the same reservation lifecycle.
              } else if (status === 'failed' || status === 'rejected') {
                updateBooking(finalKey, {
                  reservationKey: finalKey,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });

                invalidateInstitutionalReservationQueries(queryClient, {
                  labId: variables.tokenId,
                  reservationKey: finalKey,
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
  const { institutionBackendUrl } = useUser();
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  return useMutation({
    mutationFn: async (reservationInput) => {
      const normalizedInput = normalizeReservationMutationInput(reservationInput);
      const reservationKey = normalizedInput.reservationKey;
      if (!institutionBackendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      if (!reservationKey) {
        throw new Error('Missing reservationKey');
      }

      const snapshot = resolveReservationSnapshotFromCache(queryClient, reservationKey);
      const resolvedLabId = normalizedInput.labId ?? snapshot.labId;
      const resolvedPrice = normalizedInput.price ?? snapshot.price;

      const data = await runActionIntent(ACTION_CODES.CANCEL_REQUEST_BOOKING, {
        reservationKey,
        backendUrl: institutionBackendUrl,
        labId: resolvedLabId,
        price: resolvedPrice ?? 0,
      });
      devLog.log('useCancelReservationRequestSSO intent (webauthn):', data);
      return { ...data, reservationKey };
    },
    onSuccess: (data, reservationInput) => {
      const reservationKey =
        data?.reservationKey || normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) {
        devLog.error('Missing reservationKey on cancel reservation request success callback');
        return;
      }
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
                backendUrl: data?.backendUrl || institutionBackendUrl,
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

                // Invalidate relevant caches after cancellation is executed
                const { labId, userAddress } = resolveBookingContext(queryClient, reservationKey);
                if (userAddress) {
                  queryClient.invalidateQueries({ 
                    queryKey: bookingQueryKeys.reservationsOf(userAddress) 
                  });
                }
                if (labId) {
                  queryClient.invalidateQueries({ 
                    queryKey: bookingQueryKeys.getReservationsOfToken(labId) 
                  });
                }
                queryClient.invalidateQueries({
                  queryKey: bookingQueryKeys.byReservationKey(reservationKey)
                });

                devLog.log('✅ Invalidated booking queries after reservation request cancellation executed');

                // Enqueue for reconciliation - will auto-invalidate until blockchain event confirms
                const cancelReconciliationKeys = [];
                if (userAddress) {
                  cancelReconciliationKeys.push(bookingQueryKeys.reservationsOf(userAddress));
                }
                if (labId) {
                  cancelReconciliationKeys.push(bookingQueryKeys.getReservationsOfToken(labId));
                }
                cancelReconciliationKeys.push(bookingQueryKeys.byReservationKey(reservationKey));
                
                enqueueReconciliationEntry({
                  id: `booking:cancel-request:${reservationKey}`,
                  category: 'booking-cancel-request',
                  queryKeys: cancelReconciliationKeys,
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

                const { labId } = resolveBookingContext(queryClient, reservationKey);
                invalidateInstitutionalReservationQueries(queryClient, {
                  labId,
                  reservationKey,
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
      const normalizedReservationKey = normalizeReservationMutationInput(reservationKey).reservationKey;
      try {
        if (normalizedReservationKey) {
          clearOptimisticBookingState(normalizedReservationKey);
        }
      } catch (err) {
        devLog.warn('Failed to clear optimistic booking state on SSO cancel error:', err);
      }
      if (normalizedReservationKey) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(normalizedReservationKey) });
      }
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
    mutationFn: async (reservationInput) => {
      const reservationKey = normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) {
        throw new Error('Missing reservationKey');
      }
      const txHash = await cancelReservationRequest([reservationKey]);
      
      devLog.log('🔍 useCancelReservationRequestWallet - Transaction Hash:', txHash);
      return { hash: txHash, reservationKey };
    },
    onSuccess: (result, reservationInput) => {
      const reservationKey =
        result?.reservationKey || normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) return;
      // Keep reservation visible until BookingEventContext receives ReservationRequestCanceled.
      devLog.log('✅ Reservation request cancellation tx sent via wallet - waiting for on-chain event');

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
    onError: (error, reservationInput) => {
      const reservationKey = normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) return;
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
    mutationFn: async (reservationInput) => {
      const normalizedInput = normalizeReservationMutationInput(reservationInput);
      const reservationKey = normalizedInput.reservationKey;
      if (!institutionBackendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      if (!reservationKey) {
        throw new Error('Missing reservationKey');
      }

      const snapshot = resolveReservationSnapshotFromCache(queryClient, reservationKey);
      const resolvedLabId = normalizedInput.labId ?? snapshot.labId;
      const resolvedPrice = normalizedInput.price ?? snapshot.price;

      const data = await runActionIntent(ACTION_CODES.CANCEL_BOOKING, {
        reservationKey,
        backendUrl: institutionBackendUrl,
        labId: resolvedLabId,
        price: resolvedPrice ?? 0,
      });
      devLog.log('useCancelBookingSSO intent (webauthn):', data);
      return { ...data, reservationKey };
    },
    onSuccess: (data, reservationInput) => {
      const reservationKey =
        data?.reservationKey || normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) {
        devLog.error('Missing reservationKey on cancel booking success callback');
        return;
      }
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
              const result = await pollIntentStatus(intentId, {
                authToken,
                backendUrl: data?.backendUrl || institutionBackendUrl,
              });
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
                      intentStatus: 'executed',
                      note: 'Cancellation submitted on-chain',
                    },
                  };
                });

                try {
                  completeOptimisticBookingState(reservationKey);
                } catch (err) {
                  devLog.warn('Failed to complete optimistic booking state after cancel booking executed:', err);
                }

                // Invalidate relevant caches after booking cancellation is executed
                const { labId, userAddress } = resolveBookingContext(queryClient, reservationKey);
                if (userAddress) {
                  queryClient.invalidateQueries({ 
                    queryKey: bookingQueryKeys.reservationsOf(userAddress) 
                  });
                }
                if (labId) {
                  queryClient.invalidateQueries({ 
                    queryKey: bookingQueryKeys.getReservationsOfToken(labId) 
                  });
                }
                queryClient.invalidateQueries({
                  queryKey: bookingQueryKeys.byReservationKey(reservationKey)
                });

                devLog.log('✅ Invalidated booking queries after booking cancellation executed');

                // Enqueue for reconciliation - will auto-invalidate until BookingCanceled event confirms
                const bookingCancelKeys = [];
                if (userAddress) {
                  bookingCancelKeys.push(bookingQueryKeys.reservationsOf(userAddress));
                }
                if (labId) {
                  bookingCancelKeys.push(bookingQueryKeys.getReservationsOfToken(labId));
                }
                bookingCancelKeys.push(bookingQueryKeys.byReservationKey(reservationKey));
                
                enqueueReconciliationEntry({
                  id: `booking:cancel:${reservationKey}`,
                  category: 'booking-cancel',
                  queryKeys: bookingCancelKeys,
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
    onError: (error, reservationInput) => {
      const reservationKey = normalizeReservationMutationInput(reservationInput).reservationKey;
      if (reservationKey) {
        queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
      }
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
    mutationFn: async (reservationInput) => {
      const reservationKey = normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) {
        throw new Error('Missing reservationKey');
      }
      const txHash = await cancelBooking([reservationKey]);
      
      devLog.log('🔍 useCancelBookingWallet - Transaction Hash:', txHash);
      return { hash: txHash, reservationKey };
    },
    onSuccess: (result, reservationInput) => {
      const reservationKey =
        result?.reservationKey || normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) return;
      // Keep booking visible until BookingEventContext receives BookingCanceled.
      devLog.log('✅ Booking cancellation tx sent via wallet - waiting for on-chain event');

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
    onError: (error, reservationInput) => {
      const reservationKey = normalizeReservationMutationInput(reservationInput).reservationKey;
      if (!reservationKey) return;
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
    mutationFn: async (requestInput = {}) => {
      const { labId, maxBatch, backendUrl } = normalizeRequestFundsInput(requestInput, {
        fallbackBackendUrl: institutionBackendUrl,
      })
      if (!backendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      const data = await runActionIntent(ACTION_CODES.REQUEST_FUNDS, {
        backendUrl,
        labId,
        maxBatch,
      });
      devLog.log('useRequestFundsSSO intent (webauthn):', data);
      return data;
    },
    onSuccess: (_result, variables) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance() });
      queryClient.invalidateQueries({ queryKey: ['staking', 'pendingPayouts'], exact: false });

      const normalizedLabId = Number(variables?.labId)
      if (Number.isInteger(normalizedLabId) && normalizedLabId >= 0) {
        queryClient.invalidateQueries({ queryKey: stakingQueryKeys.pendingPayout(normalizedLabId) });
      }
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
    mutationFn: async (requestInput = {}) => {
      const { labId, maxBatch } = normalizeRequestFundsInput(requestInput)
      const txHash = await requestFunds([BigInt(labId), BigInt(maxBatch)]);
      devLog.log('useRequestFundsWallet - tx sent:', txHash);
      return { hash: txHash, labId };
    },
    onSuccess: (_result, variables) => {
      // Invalidate safe balance and related queries
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.safeBalance() });
      queryClient.invalidateQueries({ queryKey: ['staking', 'pendingPayouts'], exact: false });

      const normalizedLabId = Number(variables?.labId)
      if (Number.isInteger(normalizedLabId) && normalizedLabId >= 0) {
        queryClient.invalidateQueries({ queryKey: stakingQueryKeys.pendingPayout(normalizedLabId) });
      }
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

