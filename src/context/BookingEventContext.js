"use client";
import { createContext, useContext, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useBookingCacheUpdates } from '@/hooks/booking/useBookings'
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
        devLog.log(`🎯 [BookingEventContext] Smart cache update (reason: ${reason}):`, { labId, userAddress, action });
        
        // Try granular update first if we have booking data and action
        if (bookingData && action && (userAddress || labId)) {
            try {
                bookingCacheUpdates.smartBookingInvalidation(userAddress, labId, bookingData, action);
                devLog.log(`✅ [BookingEventContext] Granular cache update completed`);
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

        devLog.log(`✅ [BookingEventContext] Cache update completed`);
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
                        `Reservation request denied (${reservationKey})`,
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

                    // Add to processing set ONLY if it's the current user's reservation
                    if (address && renter.toString().toLowerCase() === address.toLowerCase()) {
                        setProcessingBookings(prev => {
                            const newSet = new Set(prev).add(reservationKey);
                            devLog.log('➕ Adding reservation to processing (current user):', { 
                                reservationKey, 
                                total: newSet.size, 
                                currentUser: address 
                            });
                            return newSet;
                        });
                    }

                    // **CRITICAL FIX**: Process the reservation request via API (missing in react-query branch)
                    try {
                        devLog.log('🔄 Processing reservation request via API...', {
                            reservationKey,
                            labId: labId.toString(),
                            labIdType: typeof labId,
                            rawLabId: labId,
                            start: start.toString(),
                            end: end.toString()
                        });

                        // Prepare the request body with extensive logging
                        const requestBody = {
                            reservationKey: reservationKey,
                            labId: labId.toString(),
                            start: start.toString(),
                            end: end.toString(),
                            metadataUri: null // Will be resolved by the API if needed
                        };

                        devLog.log('🔄 Request body being sent to processReservationRequest:', requestBody);

                        // Get lab metadata URI from context or fetch it
                        // For now, we'll use the labId as a fallback since URI might not be immediately available
                        const response = await fetch('/api/contract/reservation/processReservationRequest', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(requestBody),
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            devLog.error('❌ Process reservation API failed:', {
                                status: response.status,
                                statusText: response.statusText,
                                error: errorText
                            });
                            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
                        }

                        const result = await response.json();
                        devLog.log('✅ Process reservation API result:', result);

                        // Use granular cache update based on API result with enhanced information
                        try {
                            const reservationStatus = result.action === 'confirmed' ? 'confirmed' : 
                                                    result.action === 'denied' ? 'denied' : 'pending';
                            
                            const cacheAction = result.cacheUpdate?.operation || 'add';
                            
                            await updateBookingCaches(
                                labId?.toString(), 
                                renter, 
                                { 
                                    id: reservationKey, 
                                    labId: labId?.toString(), 
                                    renter,
                                    status: reservationStatus,
                                    timestamp: result.timestamp || new Date().toISOString(),
                                    reason: result.reason || 'API processing completed',
                                    processedAt: new Date().toISOString()
                                }, 
                                cacheAction, 
                                'api_processing_result'
                            );
                            devLog.log('📅 Enhanced granular cache update for processed reservation:', { 
                                reservationKey, 
                                status: reservationStatus, 
                                action: cacheAction,
                                apiResponse: result.action 
                            });

                            // Show notification based on API result
                            if (result.action === 'confirmed') {
                                addPersistentNotification(
                                    'success',
                                    `Reservation confirmed`,
                                    { duration: 5000 }
                                );
                            } else if (result.action === 'denied') {
                                addPersistentNotification(
                                    'warning',
                                    `Reservation denied: ${result.reason}`,
                                    { duration: 7000 }
                                );
                            } else {
                                addPersistentNotification(
                                    'info',
                                    `Reservation processed - Status: ${reservationStatus}`,
                                    { duration: 5000 }
                                );
                            }

                        } catch (cacheError) {
                            devLog.warn('Granular cache update failed for processed reservation:', cacheError);
                        }

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
        enabled: !!contractAddress && !!address,
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

                    // Smart cache update for canceled booking
                    await updateBookingCaches(
                        null, // labId not available in this event
                        null, // renter not available in this event
                        { 
                            id: reservationKey
                        }, 
                        'remove', 
                        'booking_canceled'
                    );

                    // Show notification
                    addPersistentNotification(
                        'warning',
                        `Booking cancelled (${reservationKey})`,
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

                    // Smart cache update for canceled reservation request
                    await updateBookingCaches(
                        null, // labId not available in this event
                        null, // renter not available in this event
                        { 
                            id: reservationKey
                        }, 
                        'remove', 
                        'reservation_request_canceled'
                    );

                    // Show notification
                    addPersistentNotification(
                        'info',
                        `Reservation request cancelled`,
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
