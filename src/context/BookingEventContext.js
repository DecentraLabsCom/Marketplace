"use client";
import { createContext, useContext, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useBookingCacheUpdates, useReservation, useConfirmReservationRequestSSO } from '@/hooks/booking/useBookings'
import { useQueryClient } from '@tanstack/react-query'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const BookingEventContext = createContext();

/**
 * Provider for booking-related blockchain events
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function BookingEventProvider({ children }) {
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const queryClient = useQueryClient();
    const bookingCacheUpdates = useBookingCacheUpdates();
    const { addPersistentNotification } = useNotifications();
    const [processingBookings, setProcessingBookings] = useState(new Set());

    // Manual update coordination system (prevents UI + blockchain event duplicates)
    const [manualUpdateInProgress, setManualUpdateInProgress] = useState(false);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    /**
     * Helper function that replicates useReservation hook logic for event listeners
     * Cannot use hooks directly in event listeners, so we replicate the logic
     */
    const getReservationData = async (reservationKey) => {
        if (!reservationKey) throw new Error('Reservation key is required');
        
        const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${reservationKey}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch reservation ${reservationKey}: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.log('🔍 getReservationData (helper):', reservationKey, data);
        return data;
    };

    /**
     * Helper function that replicates useConfirmReservationRequestSSO hook logic for event listeners
     * Cannot use hooks directly in event listeners, so we replicate the logic
     */
    const confirmReservationData = async (reservationKey) => {
        const response = await fetch('/api/contract/reservation/confirmReservationRequest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservationKey })
        });

        if (!response.ok) {
            throw new Error(`Failed to confirm reservation request: ${response.status}`);
        }

        const data = await response.json();
        
        // Replicate the onSuccess logic from useConfirmReservationRequestSSO hook
        queryClient.invalidateQueries(['reservations', 'getReservation', reservationKey]);
        queryClient.invalidateQueries(['reservations']);
        
        return data;
    };

    // Helper function to invalidate all booking-related caches
    /**
     * Smart booking cache update - tries granular first, falls back to invalidation
     * @param {string|number} labId - Lab ID
     * @param {string} userAddress - User address
     * @param {Object} [bookingData] - Booking data for granular updates
     * @param {string} [action] - Action type: 'add', 'remove', 'update'
     * @param {string} [reason] - Reason for cache update
     */
    const updateBookingCaches = async (labId = null, userAddress = null, bookingData = null, action = null, reason = 'event') => {
        devLog.log(`🎯 [BookingEventContext] Smart cache update (reason: ${reason}):`, { 
            labId, 
            userAddress, 
            action, 
            bookingDataId: bookingData?.id,
            bookingStatus: bookingData?.status 
        });
        
        // Try granular update first if we have booking data and action
        if (bookingData && action && (userAddress || labId)) {
            try {
                bookingCacheUpdates.smartBookingInvalidation(userAddress, labId, bookingData, action);
                devLog.log(`✅ [BookingEventContext] Granular cache update completed for ${reason}`);
                return;
            } catch (error) {
                devLog.warn('⚠️ Granular update failed, falling back to invalidation:', error);
            }
        }
        
        // Fallback to traditional invalidation
        if (labId || userAddress) {
            // Use smart invalidation (it tries granular first internally)
            bookingCacheUpdates.smartBookingInvalidation(userAddress, labId);
        } else {
            // Full invalidation (rare case)
            devLog.log('🔄 [BookingEventContext] Using full cache invalidation');
        }

        devLog.log(`✅ [BookingEventContext] Cache update completed for ${reason}`);
    };

    // ReservationConfirmed event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationConfirmed',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[BookingEventContext] Skipping ReservationConfirmed event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    // ReservationConfirmed only emits reservationKey
                    const { reservationKey } = log.args;
                    
                    devLog.log('📝 [BookingEventContext] ReservationConfirmed event received:', {
                        reservationKey,
                        timestamp: new Date().toISOString()
                    });

                    // For confirmed reservations, we need to get labId and renter from cache or additional lookup
                    // Since the event only provides reservationKey, we'll use it to identify the reservation
                    // Smart cache update with available data
                    await updateBookingCaches(
                        null, // labId not available in this event
                        null, // renter not available in this event
                        { 
                            id: reservationKey,
                            status: 'confirmed',
                            timestamp: new Date().toISOString()
                        }, 
                        'update', 
                        'reservation_confirmed'
                    );
                } catch (error) {
                    devLog.error('❌ [BookingEventContext] Error processing ReservationConfirmed event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // ReservationRequestDenied event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestDenied',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[BookingEventContext] Skipping ReservationRequestDenied event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    // ReservationRequestDenied only emits reservationKey
                    const { reservationKey } = log.args;
                    
                    devLog.log('❌ [BookingEventContext] ReservationRequestDenied event received:', {
                        reservationKey,
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for denied reservation
                    await updateBookingCaches(
                        null, // labId not available in this event
                        null, // renter not available in this event
                        { 
                            id: reservationKey,
                            status: 'denied'
                        }, 
                        'remove', 
                        'reservation_denied'
                    );                    
                    // Show notification
                    addPersistentNotification(
                        'error',
                        `Reservation request denied`,
                        { duration: 5000 }
                    );

                } catch (error) {
                    devLog.error('❌ [BookingEventContext] Error processing ReservationRequestDenied event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // ReservationRequested event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[BookingEventContext] Skipping ReservationRequested event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    // Enhanced debugging for event arguments
                    devLog.log('🔍 [BookingEventContext] Raw ReservationRequested log:', {
                        rawLog: log,
                        args: log.args,
                        argsType: typeof log.args,
                        argsKeys: log.args ? Object.keys(log.args) : 'no args',
                        eventName: log.eventName,
                        address: log.address
                    });

                    // Correct destructuring based on ABI order: renter, tokenId (labId), start, end, reservationKey
                    const { renter, tokenId: labId, start, end, reservationKey } = log.args || {};
                    
                    devLog.log('📅 [BookingEventContext] ReservationRequested event received:', {
                        rawTokenId: log.args?.tokenId,
                        tokenIdType: typeof log.args?.tokenId,
                        tokenIdString: log.args?.tokenId?.toString(),
                        labId: labId?.toString(),
                        labIdType: typeof labId,
                        reservationKey,
                        renter,
                        start: start?.toString(),
                        end: end?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Validate that all required arguments exist
                    if (!reservationKey || !labId || !renter || !start || !end) {
                        devLog.error('❌ ReservationRequested event missing required arguments:', {
                            provided: log.args,
                            extracted: { labId, reservationKey, renter, start, end },
                            missing: {
                                reservationKey: !reservationKey,
                                labId: !labId,
                                renter: !renter,
                                start: !start,
                                end: !end
                            }
                        });
                        continue;
                    }

                    // **CRITICAL**: Only process the reservation request if it's the current user's reservation
                    if (!address || renter.toString().toLowerCase() !== address.toLowerCase()) {
                        devLog.log('⏭️ Skipping API processing - not current user reservation:', {
                            reservationKey,
                            renter: renter.toString(),
                            currentUser: address,
                            isCurrentUser: false
                        });
                        continue;
                    }

                    // Check if already processing this reservation
                    if (processingBookings.has(reservationKey)) {
                        devLog.log('⏭️ Skipping API processing - already in progress:', {
                            reservationKey,
                            processingCount: processingBookings.size
                        });
                        continue;
                    }

                    // Add to processing set for the current user's reservation
                    setProcessingBookings(prev => {
                        const newSet = new Set(prev).add(reservationKey);
                        devLog.log('➕ Adding reservation to processing (current user):', { 
                            reservationKey, 
                            total: newSet.size, 
                            currentUser: address 
                        });
                        return newSet;
                    });

                    // **IMMEDIATE CACHE UPDATE**: Add reservation as "pending" to both user and lab caches
                    // This ensures it appears immediately in the calendar while being processed
                    try {
                        const pendingBooking = {
                            id: reservationKey,
                            reservationKey: reservationKey,
                            labId: labId.toString(),
                            renter: renter.toString(),
                            start: start.toString(),
                            end: end.toString(),
                            status: 'pending',
                            timestamp: new Date().toISOString(),
                            isPending: true,
                            isProcessing: true
                        };

                        await updateBookingCaches(
                            labId?.toString(), 
                            renter.toString(), 
                            pendingBooking, 
                            'add', 
                            'reservation_requested_immediate'
                        );

                        devLog.log('📅 Immediate cache update - added pending reservation:', { 
                            reservationKey, 
                            labId: labId.toString(),
                            status: 'pending'
                        });

                    } catch (immediateCacheError) {
                        devLog.warn('⚠️ Immediate cache update failed, continuing with API processing:', immediateCacheError);
                    }

                    // **PROCESS RESERVATION**: Use React Query client to call existing hooks logic
                    try {
                        devLog.log('🔄 Processing reservation request using React Query...', {
                            reservationKey,
                            labId: labId.toString(),
                            labIdType: typeof labId,
                            rawLabId: labId,
                            start: start.toString(),
                            end: end.toString()
                        });

                        // Step 1: Use queryClient to fetch reservation status (same logic as useReservation hook)
                        const getReservationData = async () => {
                            if (!reservationKey) throw new Error('Reservation key is required');
                            
                            const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${reservationKey}`, {
                                method: 'GET',
                                headers: { 'Content-Type': 'application/json' }
                            });
                            
                            if (!response.ok) {
                                throw new Error(`Failed to fetch reservation ${reservationKey}: ${response.status}`);
                            }
                            
                            const data = await response.json();
                            devLog.log('� getReservationData:', reservationKey, data);
                            return data;
                        };

                        const reservationData = await queryClient.fetchQuery({
                            queryKey: ['reservations', 'getReservation', reservationKey],
                            queryFn: () => getReservationData(reservationKey),
                            staleTime: 0 // Force fresh fetch for event processing
                        });

                        devLog.log('📋 Current reservation status from helper function:', reservationData);

                        // Step 2: Based on the status, decide what action to take
                        let result;
                        
                        if (reservationData.reservation?.isPending) {
                            // Step 3: Use helper function that replicates useConfirmReservationRequestSSO logic
                            devLog.log('✅ Confirming pending reservation using helper function...');
                            
                            const confirmResult = await queryClient.fetchQuery({
                                queryKey: ['mutations', 'confirmReservationRequest', reservationKey, Date.now()], // Unique key for mutation
                                queryFn: () => confirmReservationData(reservationKey),
                                staleTime: 0
                            });

                            devLog.log('✅ Reservation confirmed via helper function:', confirmResult);
                            
                            result = {
                                action: 'confirmed',
                                transactionHash: confirmResult.transactionHash,
                                timestamp: new Date().toISOString(),
                                reason: 'Reservation confirmed automatically via helper function'
                            };
                        } else if (reservationData.reservation?.isConfirmed) {
                            // Already confirmed, just update cache
                            devLog.log('ℹ️ Reservation already confirmed, updating cache only');
                            result = {
                                action: 'confirmed',
                                timestamp: new Date().toISOString(),
                                reason: 'Reservation was already confirmed'
                            };
                        } else {
                            // Handle other statuses (cancelled, denied, etc.)
                            devLog.log('⚠️ Reservation in unexpected state:', reservationData.reservation?.reservationState);
                            result = {
                                action: 'denied',
                                timestamp: new Date().toISOString(),
                                reason: `Reservation state: ${reservationData.reservation?.reservationState || 'Unknown'}`
                            };
                        }

                        devLog.log('✅ Process reservation result using helper functions:', result);

                        // Use granular cache update based on API result with enhanced information
                        try {
                            const reservationStatus = result.action === 'confirmed' ? 'confirmed' : 
                                                    result.action === 'denied' ? 'denied' : 'pending';
                            
                            // Use 'update' action since we already added the booking as pending
                            const cacheAction = result.action === 'denied' ? 'remove' : 'update';
                            
                            const bookingUpdate = {
                                id: reservationKey,
                                reservationKey: reservationKey,
                                labId: labId?.toString(), 
                                renter: renter.toString(),
                                start: start.toString(),
                                end: end.toString(),
                                status: reservationStatus,
                                timestamp: result.timestamp || new Date().toISOString(),
                                reason: result.reason || 'API processing completed',
                                processedAt: new Date().toISOString(),
                                isPending: false,
                                isProcessing: false,
                                isConfirmed: result.action === 'confirmed',
                                isDenied: result.action === 'denied'
                            };
                            
                            await updateBookingCaches(
                                labId?.toString(), 
                                renter.toString(), 
                                bookingUpdate, 
                                cacheAction, 
                                'api_processing_result'
                            );
                            devLog.log('📅 Enhanced granular cache update for processed reservation:', { 
                                reservationKey, 
                                status: reservationStatus, 
                                action: cacheAction,
                                apiResponse: result.action 
                            });

                            // Show final notification based on API result
                            if (result.action === 'confirmed') {
                                addPersistentNotification(
                                    'success',
                                    `Reservation confirmed! Your lab booking is now active.`,
                                    { duration: 6000 }
                                );
                                devLog.log('✅ Final confirmation notification shown for reservation:', reservationKey);
                            } else if (result.action === 'denied') {
                                addPersistentNotification(
                                    'error',
                                    `Reservation denied: ${result.reason}`,
                                    { duration: 7000 }
                                );
                                devLog.log('❌ Denial notification shown for reservation:', reservationKey);
                            } else {
                                addPersistentNotification(
                                    'info',
                                    `Reservation processed - Status: ${reservationStatus}`,
                                    { duration: 5000 }
                                );
                                devLog.log('ℹ️ Processing notification shown for reservation:', reservationKey);
                            }

                        } catch (cacheError) {
                            devLog.warn('Granular cache update failed for processed reservation:', cacheError);
                        }

                        // Remove from processing set on success
                        setProcessingBookings(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(reservationKey);
                            devLog.log('✅ Removing reservation key (success):', { reservationKey, result: result.action });
                            return newSet;
                        });

                    } catch (error) {
                        devLog.error('Error processing reservation request:', error);

                        // Remove from processing set on error
                        setProcessingBookings(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(reservationKey);
                            devLog.log('Removing reservation key (error):', { reservationKey, error: error.message });
                            return newSet;
                        });

                        // On API error, still add the reservation as 'requested' for manual processing
                        try {
                            await updateBookingCaches(
                                labId?.toString(), 
                                renter, 
                                { 
                                    id: reservationKey, 
                                    labId: labId?.toString(), 
                                    renter,
                                    status: 'requested',
                                    timestamp: new Date().toISOString(),
                                    error: error.message,
                                    requiresManualProcessing: true
                                }, 
                                'add', 
                                'api_error_fallback'
                            );
                            devLog.log('📅 Fallback cache update after API error:', reservationKey);

                            // Show error notification
                            addPersistentNotification(
                                'error',
                                `Error processing reservation for Lab ${labId?.toString()}: ${error.message}`,
                                { duration: 7000 }
                            );

                        } catch (fallbackError) {
                            devLog.error('Fallback cache update also failed:', fallbackError);
                        }
                    }

                } catch (error) {
                    devLog.error('❌ [BookingEventContext] Error processing ReservationRequested event:', error);
                }
            }
        },
        enabled: !!contractAddress, // Listen to events always when contract is available
    });

    // BookingCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'BookingCanceled',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[BookingEventContext] Skipping BookingCanceled event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    // BookingCanceled only emits reservationKey
                    const { reservationKey } = log.args;
                    
                    devLog.log('🗑️ [BookingEventContext] BookingCanceled event received:', {
                        reservationKey,
                        timestamp: new Date().toISOString()
                    });

                    // Check if we already have the booking marked as cancelled (optimistic update)
                    const existingData = queryClient.getQueryData(['reservations', 'getReservation', reservationKey]);
                    if (existingData?.reservation?.status === '4' || existingData?.reservation?.status === 4) {
                        devLog.log('🔄 [BookingEventContext] Booking already marked as cancelled (optimistic update), confirming...');
                        // Just confirm the optimistic update was correct, don't change cache
                        return;
                    }

                    // Smart cache update for canceled booking (only if not already cancelled)
                    await updateBookingCaches(
                        null, // labId not available in this event
                        null, // renter not available in this event
                        { 
                            id: reservationKey,
                            status: '4' // Cancelled status
                        }, 
                        'update', 
                        'booking_canceled'
                    );

                    // Single success notification for booking cancel
                    addPersistentNotification(
                        'success',
                        `Booking canceled`,
                        { duration: 5000 }
                    );

                } catch (error) {
                    devLog.error('❌ [BookingEventContext] Error processing BookingCanceled event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // ReservationRequestCanceled event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestCanceled',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[BookingEventContext] Skipping ReservationRequestCanceled event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    // ReservationRequestCanceled only emits reservationKey
                    const { reservationKey } = log.args;
                    
                    devLog.log('❌ [BookingEventContext] ReservationRequestCanceled event received:', {
                        reservationKey,
                        timestamp: new Date().toISOString()
                    });

                    // Check if we already have the reservation marked as cancelled (optimistic update)
                    const existingData = queryClient.getQueryData(['reservations', 'getReservation', reservationKey]);
                    if (existingData?.reservation?.status === '4' || existingData?.reservation?.status === 4) {
                        devLog.log('🔄 [BookingEventContext] Reservation already marked as cancelled (optimistic update), confirming...');
                        // Just confirm the optimistic update was correct, don't change cache
                        return;
                    }

                    // Smart cache update for canceled reservation request (only if not already cancelled)
                    await updateBookingCaches(
                        null, // labId not available in this event
                        null, // renter not available in this event
                        { 
                            id: reservationKey,
                            status: '4' // Cancelled status
                        }, 
                        'update', 
                        'reservation_request_canceled'
                    );

                    // Show single green success notification for request cancellation
                    addPersistentNotification(
                        'success',
                        `Reservation request cancelled!`,
                        { duration: 5000 }
                    );

                } catch (error) {
                    devLog.error('❌ [BookingEventContext] Error processing ReservationRequestCanceled event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    const value = {
        processingBookings,
        setProcessingBookings,
        isManualUpdateInProgress,
        setManualUpdateInProgress,
        updateBookingCaches
    };

    return (
        <BookingEventContext.Provider value={value}>
            {children}
        </BookingEventContext.Provider>
    );
}

export function useBookingEvents() {
    const context = useContext(BookingEventContext);
    if (!context) {
        throw new Error('useBookingEvents must be used within a BookingEventProvider');
    }
    return context;
}

// PropTypes
BookingEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
