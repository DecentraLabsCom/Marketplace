"use client";
import { createContext, useContext, useRef, useEffect } from 'react'
import { useWatchContractEvent, useConnection } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { useBookingCacheUpdates } from '@/hooks/booking/useBookingCacheUpdates'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import { getConnectionAddress } from '@/utils/blockchain/connection'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { removeReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'
import { normalizeReservationKey } from '@/utils/booking/reservationKey'
import {
    notifyReservationConfirmed,
    notifyReservationDenied,
    notifyReservationOnChainRequested,
} from '@/utils/notifications/reservationToasts'
import { notifyUserDashboardCancellationConfirmed } from '@/utils/notifications/userDashboardToasts'

const BookingEventContext = createContext();

/**
 * Simplified Booking Event Provider
 * Only handles blockchain events and validates/updates React Query cache
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function BookingEventProvider({ children }) {
    const connection = useConnection();
    const { chain } = connection || {};
    const address = getConnectionAddress(connection);
    const safeChain = selectChain(chain);
    const chainKey = safeChain?.name?.toLowerCase?.() || 'sepolia';
    const contractAddress = contractAddresses[chainKey];
    const queryClient = useQueryClient();
    const { removeOptimisticBooking } = useBookingCacheUpdates();
    // User context and notifications for smart user targeting
    const { address: userAddress, isSSO } = useUser();
    const { addTemporaryNotification } = useNotifications();
    const backupPollingEnabled = String(process.env.NEXT_PUBLIC_BOOKING_BACKUP_POLLING_ENABLED || 'false').toLowerCase() === 'true';

    const pendingConfirmations = useRef(new Map()); // Track reservations waiting for provider action (backup polling)
    const pendingCancellations = useRef(new Map()); // Track reservations currently being cancelled from this session
    const notifiedConfirmations = useRef(new Set()); // Avoid duplicate confirmation toasts
    const notifiedOnChainRequested = useRef(new Set()); // Avoid duplicate on-chain requested toasts

    const { clearOptimisticBookingState } = useOptimisticUI();

    const trackPendingConfirmation = (reservationKey, tokenId, requesterAddress) => {
        const normalizedKey = normalizeReservationKey(reservationKey);
        if (!normalizedKey) {
            return;
        }

        pendingConfirmations.current.set(normalizedKey, {
            timestamp: Date.now(),
            tokenId,
            requester: requesterAddress?.toLowerCase?.() ?? requesterAddress,
            attempts: 0
        });
    };

    const registerPendingConfirmation = (reservationKey, tokenId, requesterAddress) => {
        const normalizedKey = normalizeReservationKey(reservationKey);
        if (!normalizedKey) return;

        const existing = pendingConfirmations.current.get(normalizedKey);
        pendingConfirmations.current.set(normalizedKey, {
            timestamp: existing?.timestamp ?? Date.now(),
            tokenId: tokenId?.toString?.() ?? tokenId ?? existing?.tokenId,
            requester: requesterAddress?.toLowerCase?.() ?? requesterAddress ?? existing?.requester,
            attempts: existing?.attempts ?? 0,
        });
    };

    const registerPendingCancellation = (reservationKey, tokenId, requesterAddress) => {
        const normalizedKey = normalizeReservationKey(reservationKey);
        if (!normalizedKey) return;

        const existing = pendingCancellations.current.get(normalizedKey);
        pendingCancellations.current.set(normalizedKey, {
            timestamp: existing?.timestamp ?? Date.now(),
            tokenId: tokenId?.toString?.() ?? tokenId ?? existing?.tokenId,
            requester: requesterAddress?.toLowerCase?.() ?? requesterAddress ?? existing?.requester,
        });
    };

    const emitReservationDenied = (reservationKey, tokenId, notified = false, reason = null) => {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(
                new CustomEvent('reservation-request-denied', {
                    detail: {
                        reservationKey,
                        tokenId,
                        notified,
                        reason,
                    }
                })
            );
        } catch (err) {
            devLog.warn('Failed to emit reservation-request-denied event:', err);
        }
    };

    const emitReservationCancelled = (reservationKey, tokenId, type = 'booking', notified = false) => {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(
                new CustomEvent('reservation-cancelled', {
                    detail: {
                        reservationKey,
                        tokenId,
                        type,
                        notified,
                    }
                })
            );
        } catch (err) {
            devLog.warn('Failed to emit reservation-cancelled event:', err);
        }
    };

    const shouldNotifyConfirmation = (reservationKey) => {
        const normalizedKey = normalizeReservationKey(reservationKey);
        if (!normalizedKey) return false;
        if (notifiedConfirmations.current.has(normalizedKey)) return false;
        notifiedConfirmations.current.add(normalizedKey);
        return true;
    };

    const shouldNotifyOnChainRequested = (reservationKey) => {
        const normalizedKey = normalizeReservationKey(reservationKey);
        if (!normalizedKey) return false;
        if (notifiedOnChainRequested.current.has(normalizedKey)) return false;
        notifiedOnChainRequested.current.add(normalizedKey);
        return true;
    };

    const emitReservationRequestedOnChain = (reservationKey, tokenId) => {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(
                new CustomEvent('reservation-requested-onchain', {
                    detail: {
                        reservationKey,
                        tokenId,
                    }
                })
            );
        } catch (err) {
            devLog.warn('Failed to emit reservation-requested-onchain event:', err);
        }
    };

    const notifyOnChainRequestedIfNeeded = (reservationKey, tokenId) => {
        const normalizedKey = normalizeReservationKey(reservationKey);
        if (!normalizedKey) return;
        if (!shouldNotifyOnChainRequested(normalizedKey)) return;

        notifyReservationOnChainRequested(addTemporaryNotification, normalizedKey);
        emitReservationRequestedOnChain(normalizedKey, tokenId);
    };

    const fetchReservationDetails = async (reservationKey) => {
        if (!reservationKey) {
            return null;
        }

        try {
            // Use React Query cache for reservation details
            const data = await queryClient.fetchQuery({
                queryKey: bookingQueryKeys.byReservationKey(reservationKey),
                queryFn: async () => {
                    const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${encodeURIComponent(reservationKey)}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch reservation: ${response.status}`);
                    }
                    return response.json();
                },
                staleTime: 5000, // 5 seconds - event-driven updates are recent
            });
            return data;
        } catch (error) {
            devLog.error(`❌ [BookingEventContext] Failed to fetch reservation ${reservationKey} details:`, error);
            return null;
        }
    };

    const invalidateReservationCaches = (reservationKey, tokenId) => {
        if (reservationKey) {
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.byReservationKey(reservationKey) 
            });
        }

        if (tokenId) {
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.getReservationsOfToken(tokenId) 
            });
            queryClient.invalidateQueries({
                queryKey: bookingQueryKeys.reservationOfTokenPrefix(tokenId),
                exact: false
            });
        }

        const normalizedUser = address || userAddress;
        if (normalizedUser) {
            queryClient.invalidateQueries({ 
                queryKey: bookingQueryKeys.reservationsOf(normalizedUser) 
            });
            if (reservationKey) {
                queryClient.invalidateQueries({
                    queryKey: bookingQueryKeys.hasActiveBooking(reservationKey, normalizedUser)
                });
            }
            if (tokenId) {
                queryClient.invalidateQueries({
                    queryKey: bookingQueryKeys.hasActiveBookingByToken(tokenId, normalizedUser)
                });
            }
        }

        if (isSSO) {
            queryClient.invalidateQueries({
                queryKey: bookingQueryKeys.ssoReservationsOf()
            });
            queryClient.invalidateQueries({
                queryKey: bookingQueryKeys.ssoReservationKeyOfUserPrefix()
            });
            queryClient.invalidateQueries({
                queryKey: bookingQueryKeys.ssoHasActiveBookingSession()
            });
            if (tokenId) {
                queryClient.invalidateQueries({
                    queryKey: bookingQueryKeys.ssoActiveReservationKeySession(tokenId)
                });
            }
        }
    };

    // ReservationRequested event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('📝 [BookingEventContext] ReservationRequested events detected:', {
                eventCount: logs.length,
                contractAddress,
                chainId: safeChain.id,
                chainName: safeChain.name,
                currentUserAddress: address || userAddress
            });
            
            // Process each reservation request
            logs.forEach((log, index) => {                
                const { reservationKey, renter, tokenId, start, end } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const normalizedReservationKey = normalizeReservationKey(reservationKeyStr);
                const tokenIdStr = tokenId?.toString();
                const requester = renter?.toString();
                const startStr = start?.toString();
                const endStr = end?.toString();
                
                devLog.log(`📝 [BookingEventContext] Processing ReservationRequested #${index + 1}:`, {
                    reservationKey: reservationKeyStr,
                    tokenId: tokenIdStr,
                    renter: requester,
                    start: startStr,
                    end: endStr,
                    rawArgs: log.args
                });
                
                const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                const requesterAddress = requester?.toLowerCase?.();
                const isPendingFromCurrentSession = normalizedReservationKey
                    ? pendingConfirmations.current.has(normalizedReservationKey)
                    : false;
                const isCurrentUserRequester = currentUserAddress && requesterAddress === currentUserAddress;

                if (
                    reservationKeyStr &&
                    tokenIdStr &&
                    (isCurrentUserRequester || isPendingFromCurrentSession)
                ) {
                    devLog.log(`🕒 [BookingEventContext] Tracking reservation ${reservationKeyStr} for fallback polling`);
                    const requesterToTrack = requesterAddress || pendingConfirmations.current.get(normalizedReservationKey)?.requester;
                    trackPendingConfirmation(reservationKeyStr, tokenIdStr, requesterToTrack);
                    notifyOnChainRequestedIfNeeded(reservationKeyStr, tokenIdStr);
                }
            });
        }
    });

    // ReservationConfirmed event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationConfirmed',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('✅ [BookingEventContext] ReservationConfirmed events detected:', logs.length);
            
            logs.forEach(async (log, index) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const normalizedReservationKey = normalizeReservationKey(reservationKeyStr);
                const tokenIdStr = tokenId?.toString();
                
                devLog.log(`✅ [BookingEventContext] Processing ReservationConfirmed #${index + 1}:`, {
                    reservationKey: reservationKeyStr,
                    tokenId: tokenIdStr,
                    rawArgs: log.args
                });
                
                // Invalidate all booking queries
                if (normalizedReservationKey) {
                    devLog.log('🔄 Invalidating booking caches for confirmed reservation:', normalizedReservationKey);

                    // Remove from pending confirmations (event was detected successfully)
                    const pendingInfo = pendingConfirmations.current.get(normalizedReservationKey);
                    if (pendingInfo) {
                        devLog.log('✅ Removing from pending confirmations (event detected):', normalizedReservationKey);
                        pendingConfirmations.current.delete(normalizedReservationKey);
                    }

                    // Remove reconciliation entry - event confirmed, no need to keep polling
                    removeReconciliationEntry(`booking:confirm:${normalizedReservationKey}`);

                    invalidateReservationCaches(normalizedReservationKey, tokenIdStr);
                    removeOptimisticBooking(normalizedReservationKey);

                    const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                    let shouldNotify = false;

                    if (pendingInfo) {
                        if (pendingInfo.requester && currentUserAddress) {
                            shouldNotify = pendingInfo.requester === currentUserAddress;
                        } else {
                            // If a reservation was explicitly registered from this browser session,
                            // notify even when renter address is not available in client user context.
                            shouldNotify = true;
                        }
                    }

                    if (!shouldNotify && currentUserAddress) {
                        const reservationDetails = await fetchReservationDetails(normalizedReservationKey);
                        const renterAddress = reservationDetails?.reservation?.renter?.toLowerCase?.();
                        if (renterAddress && renterAddress === currentUserAddress) {
                            shouldNotify = true;
                        }
                    }

                    if (shouldNotify && shouldNotifyConfirmation(normalizedReservationKey)) {
                        notifyReservationConfirmed(addTemporaryNotification, normalizedReservationKey);
                    }

                    // Clear optimistic booking state if present
                    try {
                      if (normalizedReservationKey) clearOptimisticBookingState(String(normalizedReservationKey));
                    } catch (err) {
                      devLog.warn('Failed to clear optimistic booking state after ReservationConfirmed event:', err);
                    }
                }
            });
        }
    });

    // BACKUP POLLING: Check pending confirmations periodically in case events are missed
    // This ensures confirmations happen even if blockchain events are not detected
    useEffect(() => {
        if (!backupPollingEnabled) return undefined;

        const pollingInterval = setInterval(async () => {
            const now = Date.now();
            const pendingArray = Array.from(pendingConfirmations.current.entries());
            
            if (pendingArray.length > 0) {
                devLog.log(`🔍 [Backup Polling] Checking ${pendingArray.length} pending confirmations...`);
            }
            
            // Use Promise.allSettled for proper parallel execution of async operations
            const pollingPromises = pendingArray.map(async ([reservationKey, info]) => {
                const reservationKeyStr = normalizeReservationKey(reservationKey);
                const elapsedSeconds = (now - info.timestamp) / 1000;
                
                // Poll every 10 seconds for the first 2 minutes, then remove
                if (elapsedSeconds > 120) {
                    devLog.warn(`⏱️ [Backup Polling] Timeout for reservation ${reservationKey}, removing from pending`);
                    pendingConfirmations.current.delete(reservationKey);
                    return;
                }
                
                // Only check every 10 seconds
                if (info.attempts > 0 && elapsedSeconds < info.attempts * 10) {
                    return;
                }
                
                try {
                    // Check if reservation was confirmed by querying the blockchain
                    devLog.log(`🔍 [Backup Polling] Checking status for reservation ${reservationKey} (attempt ${info.attempts + 1})`);
                    
                    const data = await fetchReservationDetails(reservationKey);
                    const statusNumber = Number(data?.reservation?.status);
                    const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                    const isCurrentUserReservation = info.requester
                        ? (currentUserAddress && info.requester === currentUserAddress)
                        : true;

                    if (Number.isFinite(statusNumber) && statusNumber !== 0) {
                        pendingConfirmations.current.delete(reservationKey);

                        invalidateReservationCaches(reservationKey, info.tokenId);
                        removeOptimisticBooking(reservationKey);

                        if (isCurrentUserReservation) {
                            if (statusNumber === 5) {
                                notifyReservationDenied(addTemporaryNotification, reservationKey, { isSSO });
                                emitReservationDenied(reservationKey, info.tokenId, true, null);
                            } else {
                                // If live ReservationRequested was missed, recover the toast via polling.
                                notifyOnChainRequestedIfNeeded(reservationKeyStr, info.tokenId);
                                if (shouldNotifyConfirmation(reservationKeyStr)) {
                                    notifyReservationConfirmed(addTemporaryNotification, reservationKeyStr);
                                }
                            }
                        } else if (statusNumber === 5) {
                            emitReservationDenied(reservationKey, info.tokenId, false, null);
                        }
                    } else {
                        if (Number.isFinite(statusNumber) && statusNumber === 0 && isCurrentUserReservation) {
                            // Pending status confirms request exists on-chain even if event listener missed it.
                            notifyOnChainRequestedIfNeeded(reservationKeyStr, info.tokenId);
                        }
                        // Still pending, increment attempt counter
                        pendingConfirmations.current.set(reservationKey, {
                            ...info,
                            attempts: info.attempts + 1
                        });
                    }
                } catch (error) {
                    devLog.error(`❌ [Backup Polling] Error checking reservation ${reservationKey}:`, error);
                    // Increment attempt counter even on error
                    pendingConfirmations.current.set(reservationKey, {
                        ...info,
                        attempts: info.attempts + 1
                    });
                }
            });
            
            // Wait for all polling operations to settle (success or failure)
            if (pollingPromises.length > 0) {
                await Promise.allSettled(pollingPromises);
            }
        }, 10000); // Check every 10 seconds
        
        return () => clearInterval(pollingInterval);
    }, [backupPollingEnabled, queryClient, address, userAddress, addTemporaryNotification]);

    // BookingCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'BookingCanceled',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('❌ [BookingEventContext] BookingCanceled events detected:', logs.length);
            
            logs.forEach((log) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = normalizeReservationKey(reservationKey?.toString());
                const tokenIdStr = tokenId?.toString();
                
                if (reservationKeyStr) {
                    const pendingCancellationInfo = pendingCancellations.current.get(reservationKeyStr);
                    if (pendingCancellationInfo) {
                        pendingCancellations.current.delete(reservationKeyStr);
                    }

                    pendingConfirmations.current.delete(reservationKeyStr);
                    removeReconciliationEntry(`booking:cancel:${reservationKeyStr}`);
                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);
                    removeOptimisticBooking(reservationKeyStr);

                    if (pendingCancellationInfo) {
                        notifyUserDashboardCancellationConfirmed(addTemporaryNotification, reservationKeyStr, {
                            isRequest: false,
                        });
                    }
                    emitReservationCancelled(
                        reservationKeyStr,
                        tokenIdStr,
                        'booking',
                        Boolean(pendingCancellationInfo)
                    );
                    try {
                      clearOptimisticBookingState(String(reservationKeyStr));
                    } catch (err) {
                      devLog.warn('Failed to clear optimistic booking state after BookingCanceled event:', err);
                    }
                }
            });
        }
    });

    // ReservationRequestCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestCanceled',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('🚫 [BookingEventContext] ReservationRequestCanceled events detected:', logs.length);
            
            logs.forEach((log) => {
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = normalizeReservationKey(reservationKey?.toString());
                const tokenIdStr = tokenId?.toString();
                
                if (reservationKeyStr) {
                    const pendingCancellationInfo = pendingCancellations.current.get(reservationKeyStr);
                    if (pendingCancellationInfo) {
                        pendingCancellations.current.delete(reservationKeyStr);
                    }

                    pendingConfirmations.current.delete(reservationKeyStr);
                    removeReconciliationEntry(`booking:cancel-request:${reservationKeyStr}`);
                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);
                    removeOptimisticBooking(reservationKeyStr);

                    if (pendingCancellationInfo) {
                        notifyUserDashboardCancellationConfirmed(addTemporaryNotification, reservationKeyStr, {
                            isRequest: true,
                        });
                    }
                    emitReservationCancelled(
                        reservationKeyStr,
                        tokenIdStr,
                        'request',
                        Boolean(pendingCancellationInfo)
                    );
                    try {
                      clearOptimisticBookingState(String(reservationKeyStr));
                    } catch (err) {
                      devLog.warn('Failed to clear optimistic booking state after ReservationRequestCanceled event:', err);
                    }
                }
            });
        }
    });

    // ReservationRequestDenied event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestDenied',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        chainId: safeChain.id,
        onLogs: (logs) => {
            devLog.log('⛔ [BookingEventContext] ReservationRequestDenied events detected:', logs.length);
            
            logs.forEach(async (log) => {
                const { reservationKey, tokenId, reason } = log.args;
                const reservationKeyStr = normalizeReservationKey(reservationKey?.toString());
                const tokenIdStr = tokenId?.toString();
                const denyReason = Number(reason);
                
                if (reservationKeyStr) {
                    const pendingInfo = pendingConfirmations.current.get(reservationKeyStr);
                    if (pendingInfo) {
                        pendingConfirmations.current.delete(reservationKeyStr);
                    }

                    // Remove reconciliation entry - event confirmed (denied), no need to keep polling
                    removeReconciliationEntry(`booking:confirm:${reservationKeyStr}`);

                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);
                    removeOptimisticBooking(reservationKeyStr);

                    const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                    let shouldNotify = false;

                    if (pendingInfo) {
                        if (pendingInfo.requester && currentUserAddress) {
                            shouldNotify = pendingInfo.requester === currentUserAddress;
                        } else {
                            shouldNotify = true;
                        }
                    }

                    if (!shouldNotify && currentUserAddress) {
                        const reservationDetails = await fetchReservationDetails(reservationKeyStr);
                        const renterAddress = reservationDetails?.reservation?.renter?.toLowerCase?.();
                        if (renterAddress && renterAddress === currentUserAddress) {
                            shouldNotify = true;
                        }
                    }

                    if (shouldNotify) {
                        notifyReservationDenied(addTemporaryNotification, reservationKeyStr, {
                            reason: Number.isFinite(denyReason) ? denyReason : undefined,
                            isSSO,
                        });
                    }
                    emitReservationDenied(
                        reservationKeyStr,
                        tokenIdStr,
                        shouldNotify,
                        Number.isFinite(denyReason) ? denyReason : null
                    );

                    // Clear optimistic booking state if present
                    try {
                      if (reservationKeyStr) clearOptimisticBookingState(String(reservationKeyStr));
                    } catch (err) {
                      devLog.warn('Failed to clear optimistic booking state after ReservationRequestDenied event:', err);
                    }
                }
            });
        }
    });


    return (
        <BookingEventContext.Provider value={{ registerPendingConfirmation, registerPendingCancellation }}>
            {children}
        </BookingEventContext.Provider>
    );
}

BookingEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

/**
 * Hook to use the Booking Event Context
 * @returns {Object} Booking event context value
 */
export function useBookingEventContext() {
    const context = useContext(BookingEventContext);
    if (context === undefined) {
        throw new Error('useBookingEventContext must be used within a BookingEventProvider');
    }
    return context;
}

export function useOptionalBookingEventContext() {
    return useContext(BookingEventContext) || {};
}

