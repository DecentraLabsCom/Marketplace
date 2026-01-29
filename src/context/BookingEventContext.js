"use client";
import { createContext, useContext, useRef, useEffect } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import { removeReconciliationEntry } from '@/utils/optimistic/reconciliationQueue'

const BookingEventContext = createContext();

/**
 * Simplified Booking Event Provider
 * Only handles blockchain events and validates/updates React Query cache
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function BookingEventProvider({ children }) {
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const queryClient = useQueryClient();
    // User context and notifications for smart user targeting
    const { address: userAddress, isSSO } = useUser();
    const { addTemporaryNotification } = useNotifications();

    const pendingConfirmations = useRef(new Map()); // Track reservations waiting for provider action (backup polling)

    const { clearOptimisticBookingState } = useOptimisticUI();

    const trackPendingConfirmation = (reservationKey, tokenId, requesterAddress) => {
        if (!reservationKey) {
            return;
        }

        pendingConfirmations.current.set(reservationKey, {
            timestamp: Date.now(),
            tokenId,
            requester: requesterAddress?.toLowerCase?.() ?? requesterAddress,
            attempts: 0
        });
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
                queryKey: ['bookings', 'sso', 'reservationKeyOfUser']
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

                if (
                    reservationKeyStr &&
                    tokenIdStr &&
                    currentUserAddress &&
                    requesterAddress === currentUserAddress
                ) {
                    devLog.log(`🕒 [BookingEventContext] Tracking reservation ${reservationKeyStr} for fallback polling`);
                    trackPendingConfirmation(reservationKeyStr, tokenIdStr, requesterAddress);
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
                const tokenIdStr = tokenId?.toString();
                
                devLog.log(`✅ [BookingEventContext] Processing ReservationConfirmed #${index + 1}:`, {
                    reservationKey: reservationKeyStr,
                    tokenId: tokenIdStr,
                    rawArgs: log.args
                });
                
                // Invalidate all booking queries
                if (reservationKeyStr) {
                    devLog.log('🔄 Invalidating booking caches for confirmed reservation:', reservationKeyStr);

                    // Remove from pending confirmations (event was detected successfully)
                    const pendingInfo = pendingConfirmations.current.get(reservationKeyStr);
                    if (pendingInfo) {
                        devLog.log('✅ Removing from pending confirmations (event detected):', reservationKeyStr);
                        pendingConfirmations.current.delete(reservationKeyStr);
                    }

                    // Remove reconciliation entry - event confirmed, no need to keep polling
                    removeReconciliationEntry(`booking:confirm:${reservationKeyStr}`);

                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);

                    const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                    let shouldNotify = false;

                    if (pendingInfo?.requester && currentUserAddress) {
                        shouldNotify = pendingInfo.requester === currentUserAddress;
                    }

                    if (!shouldNotify && currentUserAddress) {
                        const reservationDetails = await fetchReservationDetails(reservationKeyStr);
                        const renterAddress = reservationDetails?.reservation?.renter?.toLowerCase?.();
                        if (renterAddress && renterAddress === currentUserAddress) {
                            shouldNotify = true;
                        }
                    }

                    if (shouldNotify) {
                        addTemporaryNotification('success', '✅ Reservation confirmed!');
                    }

                    // Clear optimistic booking state if present
                    try {
                      if (reservationKeyStr) clearOptimisticBookingState(String(reservationKeyStr));
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
        const pollingInterval = setInterval(async () => {
            const now = Date.now();
            const pendingArray = Array.from(pendingConfirmations.current.entries());
            
            if (pendingArray.length > 0) {
                devLog.log(`🔍 [Backup Polling] Checking ${pendingArray.length} pending confirmations...`);
            }
            
            // Use Promise.allSettled for proper parallel execution of async operations
            const pollingPromises = pendingArray.map(async ([reservationKey, info]) => {
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

                    if (Number.isFinite(statusNumber) && statusNumber !== 0) {
                        const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                        const isCurrentUserReservation = info.requester && currentUserAddress && 
                            info.requester === currentUserAddress;

                        pendingConfirmations.current.delete(reservationKey);

                        invalidateReservationCaches(reservationKey, info.tokenId);

                        if (isCurrentUserReservation) {
                            if (statusNumber === 5) {
                                addTemporaryNotification('error', '❌ Reservation denied by the provider.');
                            } else {
                                addTemporaryNotification('success', '✅ Reservation confirmed!');
                            }
                        }
                    } else {
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
    }, [queryClient, address, userAddress, addTemporaryNotification]);

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
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                if (reservationKeyStr) {
                    pendingConfirmations.current.delete(reservationKeyStr);
                    removeReconciliationEntry(`booking:cancel:${reservationKeyStr}`);
                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);
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
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                if (reservationKeyStr) {
                    pendingConfirmations.current.delete(reservationKeyStr);
                    removeReconciliationEntry(`booking:cancel-request:${reservationKeyStr}`);
                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);
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
                const { reservationKey, tokenId } = log.args;
                const reservationKeyStr = reservationKey?.toString();
                const tokenIdStr = tokenId?.toString();
                
                if (reservationKeyStr) {
                    const pendingInfo = pendingConfirmations.current.get(reservationKeyStr);
                    if (pendingInfo) {
                        pendingConfirmations.current.delete(reservationKeyStr);
                    }

                    // Remove reconciliation entry - event confirmed (denied), no need to keep polling
                    removeReconciliationEntry(`booking:confirm:${reservationKeyStr}`);

                    invalidateReservationCaches(reservationKeyStr, tokenIdStr);

                    const currentUserAddress = (address || userAddress)?.toLowerCase?.();
                    let shouldNotify = false;

                    if (pendingInfo?.requester && currentUserAddress) {
                        shouldNotify = pendingInfo.requester === currentUserAddress;
                    }

                    if (!shouldNotify && currentUserAddress) {
                        const reservationDetails = await fetchReservationDetails(reservationKeyStr);
                        const renterAddress = reservationDetails?.reservation?.renter?.toLowerCase?.();
                        if (renterAddress && renterAddress === currentUserAddress) {
                            shouldNotify = true;
                        }
                    }

                    if (shouldNotify) {
                        addTemporaryNotification('error', '❌ Reservation denied by the provider.');
                    }

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
        <BookingEventContext.Provider value={{}}>
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
