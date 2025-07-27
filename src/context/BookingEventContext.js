"use client"
import { createContext, useContext, useState } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/utils/queryKeys';
import { useNotifications } from "@/context/NotificationContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";
import devLog from '@/utils/logger';

const BookingEventContext = createContext();

export function BookingEventProvider({ children }) {
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const queryClient = useQueryClient();
    const { addPersistentNotification } = useNotifications();
    const [processingBookings, setProcessingBookings] = useState(new Set());

    // Manual update coordination system (prevents UI + blockchain event duplicates)
    const [manualUpdateInProgress, setManualUpdateInProgress] = useState(false);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    // Helper function to invalidate all booking-related caches
    const invalidateAllBookingCaches = async (labId = null, reason = 'event') => {
        devLog.log(`♻️ [BookingEventContext] Invalidating caches (reason: ${reason}):`, { labId });
        
        // Always invalidate user bookings
        await queryClient.invalidateQueries({ 
            queryKey: [QUERY_KEYS.USER_BOOKINGS]
        });

        if (labId) {
            // Invalidate specific lab bookings
            await queryClient.invalidateQueries({ 
                queryKey: [QUERY_KEYS.LAB_BOOKINGS, labId.toString()]
            });
        } else {
            // Invalidate all lab bookings
            await queryClient.invalidateQueries({ 
                queryKey: [QUERY_KEYS.LAB_BOOKINGS]
            });
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
