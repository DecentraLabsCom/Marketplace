"use client";
import { createContext, useContext, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useBookingCacheUpdates } from '@/hooks/booking/useBookings'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
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
                    const { labId, reservationKey, renter } = log.args;
                    
                    devLog.log('📝 [BookingEventContext] ReservationConfirmed event received:', {
                        labId: labId?.toString(),
                        reservationKey,
                        renter,
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update with granular update for confirmed reservation
                    await updateBookingCaches(
                        labId?.toString(), 
                        renter, 
                        { 
                            id: reservationKey, 
                            labId: labId?.toString(), 
                            renter, 
                            status: 'confirmed',
                            timestamp: new Date().toISOString()
                        }, 
                        'add', 
                        'reservation_confirmed'
                    );

                    // Show notification
                    addPersistentNotification(
                        `Reservation confirmed for Lab ${labId?.toString()}`,
                        'success',
                        5000
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
                    const { labId, reservationKey, renter } = log.args;
                    
                    devLog.log('❌ [BookingEventContext] ReservationRequestDenied event received:', {
                        labId: labId?.toString(),
                        reservationKey,
                        renter,
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for denied reservation
                    await updateBookingCaches(
                        labId?.toString(), 
                        renter, 
                        { 
                            id: reservationKey, 
                            labId: labId?.toString(), 
                            renter,
                            status: 'denied'
                        }, 
                        'remove', 
                        'reservation_denied'
                    );                    // Show notification
                    addPersistentNotification(
                        `Reservation request denied for Lab ${labId?.toString()}`,
                        'error',
                        5000
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
                    const { labId, reservationKey, renter, start, end } = log.args;
                    
                    devLog.log('📅 [BookingEventContext] ReservationRequested event received:', {
                        labId: labId?.toString(),
                        reservationKey,
                        renter,
                        start: start?.toString(),
                        end: end?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for new reservation request
                    await updateBookingCaches(
                        labId?.toString(), 
                        renter, 
                        { 
                            id: reservationKey, 
                            labId: labId?.toString(), 
                            renter,
                            status: 'requested',
                            timestamp: new Date().toISOString()
                        }, 
                        'add', 
                        'reservation_requested'
                    );

                    // Show notification
                    addPersistentNotification(
                        `New reservation request for Lab ${labId?.toString()}`,
                        'info',
                        5000
                    );

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
                    const { labId, reservationKey, renter } = log.args;
                    
                    devLog.log('🗑️ [BookingEventContext] BookingCanceled event received:', {
                        labId: labId?.toString(),
                        reservationKey,
                        renter,
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for canceled booking
                    await updateBookingCaches(
                        labId?.toString(), 
                        renter, 
                        { 
                            id: reservationKey, 
                            labId: labId?.toString(), 
                            renter
                        }, 
                        'remove', 
                        'booking_canceled'
                    );

                    // Show notification
                    addPersistentNotification(
                        `Booking cancelled for Lab ${labId?.toString()}`,
                        'warning',
                        5000
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
                    const { labId, reservationKey, renter } = log.args;
                    
                    devLog.log('❌ [BookingEventContext] ReservationRequestCanceled event received:', {
                        labId: labId?.toString(),
                        reservationKey,
                        renter,
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for canceled reservation request
                    await updateBookingCaches(
                        labId?.toString(), 
                        renter, 
                        { 
                            id: reservationKey, 
                            labId: labId?.toString(), 
                            renter
                        }, 
                        'remove', 
                        'reservation_request_canceled'
                    );

                    // Show notification
                    addPersistentNotification(
                        `Reservation request cancelled for Lab ${labId?.toString()}`,
                        'info',
                        5000
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
