"use client";
/**
 * Atomic React Query Hooks for Booking-related Write Operations
 * Institutional booking mutations route through backend-managed reservation intents.
 * Customer wallet mutation variants have been removed.
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { useBookingCacheUpdates } from './useBookingCacheUpdates'
import pollIntentStatus from '@/utils/intents/pollIntentStatus'
import {
  awaitIntentAuthorization,
  resolveAuthorizationStatusBaseUrl,
} from '@/utils/intents/authorizationOrchestrator'
import devLog from '@/utils/dev/logger'
import { ACTION_CODES } from '@/utils/intents/actionCodes'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { enqueueReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'
import createPendingBookingPayload from './utils/createPendingBookingPayload'
import {
  getInstitutionalReservationQueryFilters,
  invalidateInstitutionalReservationQueries,
} from './bookingCacheInvalidation'
import {
  resolveIntentRequestId,
  assertIntentAuthorizationConfirmed,
  assertInstitutionIntentExecuted,
  createIntentMutationError,
  markBrowserCredentialVerifiedFromIntent,
  openPendingAuthorizationPopup,
  closeAuthorizationPopup,
  cancelPreparedIntent,
} from '@/utils/intents/clientFlowShared'
import {
  notifyReservationDenied,
  notifyReservationOnChainRequested,
  notifyReservationStatusError,
} from '@/utils/notifications/reservationToasts'
import {
  isReservationConfirmedStatus,
  normalizeReservationStatus,
} from '@/utils/intents/reservationStatus'

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

const emitReservationProgress = (requestData, stage, details = {}) => {
  const onProgress = requestData?.onProgress;
  if (typeof onProgress !== 'function') return;
  try {
    onProgress({ stage, ...details });
  } catch (error) {
    devLog.warn('Reservation progress callback failed:', error);
  }
};

const awaitBackendAuthorization = async (prepareData, { backendUrl, popup, presenceFn } = {}) => {
  return awaitIntentAuthorization(prepareData, {
    backendUrl,
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
  });
};

async function runActionIntent(action, payload) {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('WebAuthn not supported in this environment');
  }

  const safePayload = { ...(payload || {}) }
  delete safePayload.backendUrl
  const prepareResponse = await fetch('/api/backend/intents/actions/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action, payload: safePayload }),
  });

  const prepareData = await prepareResponse.json();
  if (!prepareResponse.ok) {
    throw createIntentMutationError(
      prepareData,
      `Failed to prepare action intent: ${prepareResponse.status}`
    );
  }

  let authorizationStatus
  try {
    authorizationStatus = await awaitBackendAuthorization(prepareData, {
      backendUrl: prepareData?.backendUrl,
    })
    assertIntentAuthorizationConfirmed(authorizationStatus)
  } catch (error) {
    await cancelPreparedIntent(prepareData)
    throw error
  }
  const authorizationRequestId =
    authorizationStatus?.requestId || resolveIntentRequestId(prepareData);
  markBrowserCredentialVerifiedFromIntent(prepareData, { includeReservationPayload: true });
  return {
    ...prepareData,
    requestId: authorizationRequestId,
    intent: prepareData.intent,
    authorization: authorizationStatus,
  }
}

// ===== MUTATIONS =====

/**
 * Hook for the unified /api/backend/intents/actions/prepare endpoint.
 * Creates a reservation request intent for SSO users.
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequestSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { updateBooking, invalidateAllBookings, addBooking, removeOptimisticBooking } = useBookingCacheUpdates();
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();
  const { addTemporaryNotification } = useNotifications();

  return useMutation({
    mutationFn: async (requestData) => {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported in this environment');
      }

      emitReservationProgress(requestData, 'preparing_intent');
      const authorizationPopup = openPendingAuthorizationPopup();

      const payload = {
        labId: requestData.tokenId ?? requestData.labId,
        start: requestData.start,
        end: requestData.end,
        timeslot: requestData.timeslot ?? requestData.duration ?? requestData.timeslotMinutes,
      }

      const prepareResponse = await fetch('/api/backend/intents/actions/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: ACTION_CODES.REQUEST_BOOKING,
          payload,
        }),
      })

      const prepareData = await prepareResponse.json()
      if (!prepareResponse.ok) {
        closeAuthorizationPopup(authorizationPopup)
        throw createIntentMutationError(
          prepareData,
          `Failed to prepare reservation intent: ${prepareResponse.status}`
        )
      }

      emitReservationProgress(requestData, 'intent_prepared', {
        requestId: resolveIntentRequestId(prepareData),
        reservationKey: prepareData?.intent?.payload?.reservationKey || null,
        txHash: prepareData?.onChain?.txHash || null,
        blockNumber: prepareData?.onChain?.blockNumber || null,
      });

      emitReservationProgress(requestData, 'awaiting_authorization');
      let authorizationStatus
      try {
        authorizationStatus = await awaitBackendAuthorization(prepareData, {
          backendUrl: prepareData?.backendUrl,
          popup: authorizationPopup,
        })
        assertIntentAuthorizationConfirmed(authorizationStatus)
      } catch (error) {
        await cancelPreparedIntent(prepareData)
        throw error
      }
      const authorizationRequestId =
        authorizationStatus?.requestId || resolveIntentRequestId(prepareData)
      markBrowserCredentialVerifiedFromIntent(prepareData, { includeReservationPayload: true })
      emitReservationProgress(requestData, 'request_submitted', { requestId: authorizationRequestId });
      return {
        ...prepareData,
        requestId: authorizationRequestId,
        intent: prepareData.intent,
        authorization: authorizationStatus,
      }
    },
    onSuccess: (data, variables) => {
      try {
        const intentId = resolveIntentRequestId(data);
        const reservationKey =
          data?.intent?.payload?.reservationKey ||
          data?.intent?.payload?.reservation_key ||
          data?.intent?.reservationKey ||
          intentId ||
          `intent-${Date.now()}`;
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
            let result;
            try {
              result = await pollIntentStatus(intentId, {
                backendUrl: data?.backendUrl || variables.backendUrl
              });
            } catch (err) {
              devLog.error('Æ’?O Polling reservation intent failed:', err);
              try {
                removeOptimisticBooking([reservationKey].filter(Boolean));
              } catch (cleanupError) {
                devLog.warn('Failed to remove optimistic booking after polling failure:', cleanupError);
              }
              try {
                clearOptimisticBookingState(reservationKey);
              } catch (cleanupError) {
                devLog.warn('Failed to clear optimistic booking state after polling failure:', cleanupError);
              }
              notifyReservationStatusError(addTemporaryNotification, reservationKey);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('reservation-request-status-error', {
                  detail: {
                    requestId: intentId,
                    reservationKey,
                    labId: variables.tokenId,
                    start: variables.start,
                  },
                }));
              }
              queryClient.invalidateQueries({ queryKey: bookingQueryKeys.byReservationKey(reservationKey) });
              invalidateAllBookings();
              return;
            }

            try {
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;
              const finalKey = result?.reservationKey || reservationKey;

              if (status === 'executed') {
                await assertInstitutionIntentExecuted(intentId, result, { signal: variables?.abortSignal });
                const reservationStatus = normalizeReservationStatus(result?.reservationStatus);
                const reservationConfirmed = isReservationConfirmedStatus(reservationStatus);
                updateBooking(finalKey, {
                  reservationKey: finalKey,
                  labId: variables.tokenId,
                  start: variables.start,
                  end: variables.end,
                  isIntentPending: false,
                  intentStatus: 'executed',
                  reservationStatus,
                  status: reservationConfirmed ? 'confirmed' : 'pending',
                  transactionHash: txHash,
                  note: reservationConfirmed
                    ? 'Reservation confirmed on-chain'
                    : 'Transaction executed; reservation awaiting on-chain confirmation',
                  timestamp: new Date().toISOString(),
                });

                if (reservationConfirmed) {
                  try {
                    completeOptimisticBookingState(finalKey);
                  } catch (err) {
                    devLog.warn('Failed to complete optimistic booking state after reservation confirmation:', err);
                  }
                }

                if (reservationKey && finalKey && reservationKey !== finalKey) {
                  try {
                    clearOptimisticBookingState(reservationKey);
                  } catch (err) {
                    devLog.warn('Failed to clear optimistic booking state for initial reservation key:', err);
                  }
                }

                // Invalidate institutional booking queries so calendar and dashboard update
                invalidateInstitutionalReservationQueries(queryClient, {
                  labId: variables.tokenId,
                  reservationKey: finalKey,
                });

                devLog.log('✅ Invalidated booking queries after institutional reservation executed:', {
                  finalKey,
                  userAddress: variables.userAddress,
                  tokenId: variables.tokenId
                });

                // A successful transaction is not confirmation evidence. The
                // backend must return a confirmed (or later) reservation state;
                // otherwise keep the user in the pending/reconciliation path,
                // including for DIRECT_BOOKING.
                if (!reservationConfirmed) {
                  notifyReservationOnChainRequested(addTemporaryNotification, finalKey);
                }
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('reservation-request-onchain', {
                    detail: {
                      requestId: intentId,
                      reservationKey: finalKey,
                      labId: variables.tokenId,
                      start: variables.start,
                    },
                  }));
                }

                // Reservation confirmation now relies on intent status polling and targeted cache invalidation.
              } else if (status === 'failed' || status === 'rejected') {
                updateBooking(finalKey, {
                  reservationKey: finalKey,
                  isIntentPending: false,
                  intentStatus: status,
                  intentError: reason,
                  note: reason || 'Rejected by institution',
                  timestamp: new Date().toISOString(),
                });

                try {
                  removeOptimisticBooking([
                    finalKey,
                    reservationKey,
                  ].filter(Boolean));
                } catch (err) {
                  devLog.warn('Failed to remove optimistic booking after reservation denial:', err);
                }

                invalidateInstitutionalReservationQueries(queryClient, {
                  labId: variables.tokenId,
                  reservationKey: finalKey,
                });

                try {
                  clearOptimisticBookingState(finalKey);
                  if (reservationKey && finalKey && reservationKey !== finalKey) {
                    clearOptimisticBookingState(reservationKey);
                  }
                } catch (err) {
                  devLog.warn('Failed to clear optimistic booking state after reservation denial:', err);
                }

                notifyReservationDenied(addTemporaryNotification, finalKey, { reason });
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('reservation-request-denied', {
                    detail: {
                      requestId: intentId,
                      reservationKey: finalKey,
                      labId: variables.tokenId,
                      start: variables.start,
                      reason,
                    },
                  }));
                }
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
 * Unified Hook for creating reservation requests (institutional / managed path only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useReservationRequest = (options = {}) => {
  return useReservationRequestSSO(options);
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
  const abortControllerRef = useRef(null);
  const { institutionBackendUrl } = useUser();
  const { setOptimisticBookingState, completeOptimisticBookingState, clearOptimisticBookingState } = useOptimisticUI();

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return useMutation({
    mutationFn: async (reservationInput) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      const normalizedInput = normalizeReservationMutationInput(reservationInput);
      const reservationKey = normalizedInput.reservationKey;
      if (!institutionBackendUrl) {
        throw new Error('Missing institutional backend URL');
      }
      if (!reservationKey) {
        throw new Error('Missing reservationKey');
      }

      const data = await runActionIntent(ACTION_CODES.CANCEL_REQUEST_BOOKING, {
        reservationKey,
        backendUrl: institutionBackendUrl,
      });
      devLog.log('useCancelReservationRequestSSO intent (webauthn):', data);
      return { ...data, reservationKey };
    },
    onSuccess: (data, reservationInput) => {
      const normalizedInput = normalizeReservationMutationInput(reservationInput);
      const reservationKey =
        data?.reservationKey || normalizedInput.reservationKey;
      if (!reservationKey) {
        devLog.error('Missing reservationKey on cancel reservation request success callback');
        return;
      }
      try {
        const intentId = resolveIntentRequestId(data);
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
          const { labId: cachedLabId, userAddress } = resolveBookingContext(queryClient, reservationKey);
          setOptimisticBookingState(reservationKey, {
            status: 'cancel-requested',
            isPending: true,
            isInstitutional: true,
            labId: cachedLabId ?? normalizedInput.labId,
            userAddress,
          });
        } catch (err) {
          devLog.warn('Failed to set optimistic booking state for SSO cancel request:', err);
        }

        if (intentId) {
          const abortController = abortControllerRef.current;
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, {
                backendUrl: data?.backendUrl || institutionBackendUrl,
                signal: abortController?.signal,
              });
              if (abortController?.signal.aborted) return;
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                await assertInstitutionIntentExecuted(intentId, result, { signal: abortController?.signal });
                if (abortController?.signal.aborted) return;
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

                // Invalidate institutional caches after cancellation is executed
                const { labId: cachedLabId } = resolveBookingContext(queryClient, reservationKey);
                const labId = cachedLabId ?? normalizedInput.labId;
                invalidateInstitutionalReservationQueries(queryClient, {
                  labId,
                  reservationKey,
                });

                devLog.log('✅ Invalidated booking queries after reservation request cancellation executed');

                // Enqueue for reconciliation - will auto-invalidate until blockchain event confirms
                enqueueReconciliationEntry({
                  id: `booking:cancel-request:${reservationKey}`,
                  category: 'booking-cancel-request',
                  queryKeys: getInstitutionalReservationQueryFilters({
                    labId,
                    reservationKey,
                  }),
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

                const { labId: cachedLabId } = resolveBookingContext(queryClient, reservationKey);
                const labId = cachedLabId ?? normalizedInput.labId;
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
              if (abortController?.signal.aborted) return;
              devLog.error('Polling cancel intent failed:', err);
              invalidateInstitutionalReservationQueries(queryClient, {
                labId: normalizedInput.labId,
                reservationKey,
              });
              invalidateAllBookings();
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to mark cancel intent in cache, invalidating:', error);
        invalidateInstitutionalReservationQueries(queryClient, {
          labId: normalizedInput.labId,
          reservationKey,
        });
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
/**
 * Unified Hook for cancelling reservation requests (institutional / managed path only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelReservationRequest = (options = {}) => {
  return useCancelReservationRequestSSO(options);
};

/**
 * Hook for /api/contract/reservation/cancelBooking endpoint
 * Cancels an existing booking (SSO users)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBookingSSO = (options = {}) => {
  const queryClient = useQueryClient();
  const { invalidateAllBookings } = useBookingCacheUpdates();
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

      const data = await runActionIntent(ACTION_CODES.CANCEL_BOOKING, {
        reservationKey,
        backendUrl: institutionBackendUrl,
      });
      devLog.log('useCancelBookingSSO intent (webauthn):', data);
      return { ...data, reservationKey };
    },
    onSuccess: (data, reservationInput) => {
      const normalizedInput = normalizeReservationMutationInput(reservationInput);
      const reservationKey =
        data?.reservationKey || normalizedInput.reservationKey;
      if (!reservationKey) {
        devLog.error('Missing reservationKey on cancel booking success callback');
        return;
      }
      try {
        try {
          const { labId: cachedLabId, userAddress } = resolveBookingContext(queryClient, reservationKey);
          setOptimisticBookingState(reservationKey, {
            status: 'cancel-requested',
            isPending: true,
            isInstitutional: true,
            labId: cachedLabId ?? normalizedInput.labId,
            userAddress,
          });
        } catch (err) {
          devLog.warn('Failed to set optimistic booking state for cancel booking SSO:', err);
        }

        const intentId = resolveIntentRequestId(data);
        if (intentId) {
          (async () => {
            try {
              const result = await pollIntentStatus(intentId, {
                backendUrl: data?.backendUrl || institutionBackendUrl,
              });
              const status = result?.status;
              const txHash = result?.txHash;
              const reason = result?.error || result?.reason;

              if (status === 'executed') {
                await assertInstitutionIntentExecuted(intentId, result);
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

                // Invalidate institutional caches after booking cancellation is executed
                const { labId: cachedLabId } = resolveBookingContext(queryClient, reservationKey);
                const labId = cachedLabId ?? normalizedInput.labId;
                invalidateInstitutionalReservationQueries(queryClient, {
                  labId,
                  reservationKey,
                });

                devLog.log('✅ Invalidated booking queries after booking cancellation executed');

                // Enqueue for reconciliation - will auto-invalidate until BookingCanceled event confirms
                enqueueReconciliationEntry({
                  id: `booking:cancel:${reservationKey}`,
                  category: 'booking-cancel',
                  queryKeys: getInstitutionalReservationQueryFilters({
                    labId,
                    reservationKey,
                  }),
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
              const { labId: cachedLabId } = resolveBookingContext(queryClient, reservationKey);
              invalidateInstitutionalReservationQueries(queryClient, {
                labId: cachedLabId ?? normalizedInput.labId,
                reservationKey,
              });
              invalidateAllBookings();
            }
          })();
        }
      } catch (error) {
        devLog.error('Failed to track cancel booking intent:', error);
        invalidateInstitutionalReservationQueries(queryClient, {
          labId: normalizedInput.labId,
          reservationKey,
        });
        invalidateAllBookings();
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
/**
 * Unified Hook for cancelling bookings (institutional / managed path only)
 * @param {Object} [options={}] - Additional mutation options
 * @returns {Object} React Query mutation object
 */
export const useCancelBooking = (options = {}) => {
  return useCancelBookingSSO(options);
};

// Re-export cache updates utility
export { useBookingCacheUpdates } from './useBookingCacheUpdates';



