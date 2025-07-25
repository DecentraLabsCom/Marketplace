"use client"
import { createContext, useContext, useState, useRef, useCallback } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { useBookings } from "@/context/BookingContext";
import { useNotifications } from "@/context/NotificationContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";
import devLog from '@/utils/logger';

const ReservationEventContext = createContext();

export function ReservationEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { labs } = useLabs();
    const { fetchUserBookings, removeBooking } = useBookings();
    const { addPersistentNotification } = useNotifications();
    const [processingReservations, setProcessingReservations] = useState(new Set());

    // Manual update coordination system (prevents UI + blockchain event duplicates)
    const [manualUpdateInProgress, setManualUpdateInProgress] = useState(false);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    // Intelligent event coordination system - similar to LabEventContext
    const lastEventTime = useRef(new Map()); // Track last event time by type
    const pendingBookingUpdates = useRef(new Set()); // Track pending reservation keys
    const bookingUpdateTimeoutRef = useRef(null);

    // Smart cache invalidation for booking-related updates
    const invalidateBookingCache = useCallback((reservationKey = null) => {
        if (reservationKey) {
            // Selective invalidation - mark specific reservation for update
            pendingBookingUpdates.current.add(reservationKey);
        } else {
            // Full invalidation - clear booking cache (but preserve labs cache)
            const cacheKeys = ['bookings_', 'labs_timestamp']; // Multiple user cache keys
            cacheKeys.forEach(key => {
                Object.keys(sessionStorage).forEach(storageKey => {
                    if (storageKey.startsWith(key)) {
                        sessionStorage.removeItem(storageKey);
                    }
                });
            });
        }
    }, []);

    // Debounced batch update for multiple booking changes
    const scheduleBookingUpdate = useCallback((delay = 300) => {
        if (bookingUpdateTimeoutRef.current) {
            clearTimeout(bookingUpdateTimeoutRef.current);
        }
        
        bookingUpdateTimeoutRef.current = setTimeout(() => {
            if (pendingBookingUpdates.current.size > 0) {
                devLog.log('📊 Processing batch booking updates for keys:', Array.from(pendingBookingUpdates.current));
                pendingBookingUpdates.current.clear();
                fetchUserBookings(true);
            }
        }, delay);
    }, [fetchUserBookings]);

    // Enhanced event handlers with collision prevention

    // Listen for ReservationRequested events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        onLogs(logs) {
            logs.forEach(log => {
                if (log.args) {
                    handleReservationRequested(log.args);
                } else {
                    devLog.error('ReservationRequested event received without parsed args:', log);
                }
            });
        },
    });

    // Enhanced ReservationConfirmed handler with collision prevention
    const handleReservationConfirmed = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            devLog.log('[ReservationEventContext] Skipping ReservationConfirmed event - manual update in progress');
            return;
        }

        const { reservationKey } = args || {};
        const eventKey = `ReservationConfirmed_${reservationKey}`;
        const now = Date.now();
        
        // Prevent duplicate processing
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);
        
        devLog.log('✅ ReservationConfirmed event received (processing):', { 
            reservationKey, 
            processingReservations: Array.from(processingReservations) 
        });
        
        if (!reservationKey) {
            devLog.error('❌ ReservationConfirmed event missing reservationKey:', args);
            return;
        }
        
        // Remove from processing
        setProcessingReservations(prev => {
            const newSet = new Set(prev);
            const hadKey = newSet.has(reservationKey);
            newSet.delete(reservationKey);
            
            devLog.log('➖ Removing reservation key from processing:', { 
                reservationKey, 
                hadKey, 
                remaining: Array.from(newSet) 
            });
            
            return newSet;
        });
        
        // Show success notification
        addPersistentNotification('success', '✅ Reservation confirmed and recorded onchain!');
        
        // Invalidate server-side cache to ensure fresh data on next fetch
        try {
            fetch('/api/contract/reservation/invalidateCache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'ReservationConfirmed', reservationKey })
            }).catch(err => devLog.warn('Cache invalidation failed:', err));
        } catch (error) {
            devLog.warn('Cache invalidation request failed:', error);
        }
        
        // Mark for smart batch update
        invalidateBookingCache(reservationKey);
        scheduleBookingUpdate(500); // Short delay for confirmed reservations
    };

    // Listen for ReservationConfirmed events to update UI
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationConfirmed',
        onLogs(logs) {
            logs.forEach(log => {
                handleReservationConfirmed(log.args);
            });
        },
    });

    // Enhanced ReservationRequestDenied handler with collision prevention  
    const handleReservationRequestDenied = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            devLog.log('[ReservationEventContext] Skipping ReservationRequestDenied event - manual update in progress');
            return;
        }

        const { reservationKey } = args || {};
        const eventKey = `ReservationRequestDenied_${reservationKey}`;
        const now = Date.now();
        
        // Prevent duplicate processing
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);
        
        devLog.log('❌ ReservationRequestDenied event received (processing):', { 
            reservationKey, 
            processingReservations: Array.from(processingReservations) 
        });
        
        if (!reservationKey) {
            devLog.error('❌ ReservationRequestDenied event missing reservationKey:', args);
            return;
        }
        
        // Remove from processing
        setProcessingReservations(prev => {
            const newSet = new Set(prev);
            const hadKey = newSet.has(reservationKey);
            newSet.delete(reservationKey);
            
            devLog.log('➖ Removing reservation key (denied):', { 
                reservationKey, 
                hadKey, 
                remaining: Array.from(newSet) 
            });
            
            return newSet;
        });
        
        // Show denial notification
        addPersistentNotification('error', '❌ Reservation denied: Reservation outside allowed dates');
        
        // Mark for smart batch update (cleanup denied reservations)
        invalidateBookingCache(reservationKey);
        scheduleBookingUpdate(300); // Quick update for denied reservations
    };

    // Listen for ReservationRequestDenied events to update UI
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestDenied',
        onLogs(logs) {
            logs.forEach(log => {
                handleReservationRequestDenied(log.args);
            });
        },
    });

    const handleReservationRequested = async (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            devLog.log('[ReservationEventContext] Skipping ReservationRequested event - manual update in progress');
            return;
        }

        const { renter, tokenId, start, end, reservationKey } = args;
        const eventKey = `ReservationRequested_${reservationKey}`;
        const now = Date.now();
        
        // Prevent duplicate processing of same event within 2 seconds
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);
        
        devLog.log('� ReservationRequested event received (processing):', {
            renter,
            tokenId: tokenId?.toString(),
            start: start?.toString(),
            end: end?.toString(),
            reservationKey
        });
        
        // Validate that all required arguments exist
        if (!reservationKey || !tokenId || !renter || !start || !end) {
            devLog.error('❌ ReservationRequested event missing required arguments:', args);
            return;
        }
        
        // Add to processing set
        setProcessingReservations(prev => {
            const newSet = new Set(prev).add(reservationKey);
            
            devLog.log('➕ Adding reservation to processing:', { reservationKey, total: newSet.size });
            
            return newSet;
        });

        try {
            // Get metadata URI from labs context
            const lab = labs?.find(lab => lab.id === tokenId.toString());
            
            if (!lab || !lab.uri) {
                devLog.error('❌ Lab not found in context or missing uri:', { 
                    labId: tokenId.toString(), 
                    availableLabs: labs?.map(l => ({ id: l.id, uri: l.uri })) 
                });
                throw new Error('Could not get metadata URI from labs context');
            }

            devLog.log('🔄 Processing reservation request via API...', {
                reservationKey,
                labId: tokenId.toString(),
                start: start.toString(),
                end: end.toString(),
                metadataUri: lab.uri
            });

            // Process the reservation request via API
            const response = await fetch('/api/contract/reservation/processReservationRequest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reservationKey: reservationKey,
                    labId: tokenId.toString(),
                    start: start.toString(),
                    end: end.toString(),
                    metadataUri: lab.uri
                }),
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
            
            // Invalidate cache immediately to show the pending reservation
            try {
                await fetch('/api/contract/reservation/invalidateCache', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: 'ReservationRequested', reservationKey })
                });
                
                // Trigger booking updates to show the pending reservation
                invalidateBookingCache(reservationKey);
                scheduleBookingUpdate(200); // Quick update for new pending reservations
                
                devLog.log('📅 Cache invalidated for new pending reservation:', reservationKey);
            } catch (cacheError) {
                devLog.warn('Cache invalidation failed for pending reservation:', cacheError);
            }
            
            // Note: We don't remove from processing here because the actual
            // confirmation/denial will come via ReservationConfirmed/ReservationDenied events
        } catch (error) {
            devLog.error('Error processing reservation request:', error);
            
            // Remove from processing set on error
            setProcessingReservations(prev => {
                const newSet = new Set(prev);
                newSet.delete(reservationKey);
                
                devLog.log('Removing reservation key (error):', { reservationKey, error: error.message });
                
                return newSet;
            });
        }
    };

    // Enhanced BookingCanceled handler with collision prevention
    const handleBookingCanceled = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            devLog.log('[ReservationEventContext] Skipping BookingCanceled event - manual update in progress');
            return;
        }

        const { reservationKey } = args || {};
        const eventKey = `BookingCanceled_${reservationKey}`;
        const now = Date.now();
        
        // Prevent duplicate processing
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);
        
        devLog.log('🗑️ BookingCanceled event received (processing):', { reservationKey });
        
        if (!reservationKey) {
            devLog.error('❌ BookingCanceled event missing reservationKey:', args);
            return;
        }
        
        // Efficiently remove the canceled booking from existing state
        removeBooking(reservationKey);
        
        // Mark for smart batch update
        invalidateBookingCache(reservationKey);
        scheduleBookingUpdate(400); // Medium delay for canceled bookings
    };

    // Enhanced ReservationRequestCanceled handler with collision prevention
    const handleReservationRequestCanceled = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            devLog.log('[ReservationEventContext] Skipping ReservationRequestCanceled event - manual update in progress');
            return;
        }

        const { reservationKey } = args || {};
        const eventKey = `ReservationRequestCanceled_${reservationKey}`;
        const now = Date.now();
        
        // Prevent duplicate processing
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);
        
        devLog.log('🗑️ ReservationRequestCanceled event received (processing):', { reservationKey });
        
        if (!reservationKey) {
            devLog.error('❌ ReservationRequestCanceled event missing reservationKey:', args);
            return;
        }
        
        // Remove from processing set if it was there
        setProcessingReservations(prev => {
            const newSet = new Set(prev);
            newSet.delete(reservationKey);
            return newSet;
        });
        
        // Efficiently remove the canceled request from existing state
        removeBooking(reservationKey);
        
        // Mark for smart batch update
        invalidateBookingCache(reservationKey);
        scheduleBookingUpdate(300); // Quick update for request cancellations
    };

    // Listen for BookingCanceled events to update info
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'BookingCanceled',
        onLogs(logs) {
            logs.forEach(log => {
                handleBookingCanceled(log.args);
            });
        },
    });

    // Listen for ReservationRequestCanceled events to update info
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestCanceled',
        onLogs(logs) {
            logs.forEach(log => {
                handleReservationRequestCanceled(log.args);
            });
        },
    });

    return (
        <ReservationEventContext.Provider value={{
            processingReservations,
            invalidateBookingCache,
            scheduleBookingUpdate,
            pendingBookingUpdates: pendingBookingUpdates.current,
            setManualUpdateInProgress,
            isManualUpdateInProgress
        }}>
            {children}
        </ReservationEventContext.Provider>
    );
}

export function useReservationEvents() {
    const context = useContext(ReservationEventContext);
    if (!context) {
        throw new Error('useReservationEvents must be used within a ReservationEventProvider');
    }
    return context;
}
