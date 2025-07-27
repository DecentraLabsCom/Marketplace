"use client";
import { createContext, useContext, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useCacheInvalidation } from '@/hooks/user/useUsers'
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
    const cacheInvalidation = useCacheInvalidation();
    const { addPersistentNotification } = useNotifications();
    const [processingBookings, setProcessingBookings] = useState(new Set());

    // Manual update coordination system (prevents UI + blockchain event duplicates)
    const [manualUpdateInProgress, setManualUpdateInProgress] = useState(false);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    // Helper function to invalidate all booking-related caches
    const invalidateAllBookingCaches = async (labId = null, reason = 'event') => {
        devLog.log(`♻️ [BookingEventContext] Invalidating caches (reason: ${reason}):`, { labId });
        
        if (labId) {
            // Invalidate specific lab and user bookings
            cacheInvalidation.invalidateBookingRelatedData(address, labId);
        } else {
            // Invalidate all bookings
            cacheInvalidation.invalidateAllBookings();
        }

        devLog.log(`✅ [BookingEventContext] Cache invalidation completed`);
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

                    // Invalidate relevant caches
                    await invalidateAllBookingCaches(labId?.toString(), 'reservation_confirmed');

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

                    // Invalidate relevant caches
                    await invalidateAllBookingCaches(labId?.toString(), 'reservation_denied');

                    // Show notification
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

                    // Invalidate relevant caches
                    await invalidateAllBookingCaches(labId?.toString(), 'reservation_requested');

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

                    // Invalidate relevant caches
                    await invalidateAllBookingCaches(labId?.toString(), 'booking_canceled');

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

                    // Invalidate relevant caches
                    await invalidateAllBookingCaches(labId?.toString(), 'reservation_request_canceled');

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
        invalidateAllBookingCaches
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
