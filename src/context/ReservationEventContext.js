"use client"
import { createContext, useContext, useState, useRef, useCallback } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { useNotifications } from "@/context/NotificationContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";

const ReservationEventContext = createContext();

export function ReservationEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { fetchBookings, removeCanceledBooking, labs } = useLabs();
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
                if (process.env.NODE_ENV === 'development') {
                    console.log('📊 Processing batch booking updates for keys:', Array.from(pendingBookingUpdates.current));
                }
                pendingBookingUpdates.current.clear();
                fetchBookings();
            }
        }, delay);
    }, [fetchBookings]);

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
                    console.error('ReservationRequested event received without parsed args:', log);
                }
            });
        },
    });

    // Enhanced ReservationConfirmed handler with collision prevention
    const handleReservationConfirmed = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            console.log('[ReservationEventContext] Skipping ReservationConfirmed event - manual update in progress');
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
        
        if (process.env.NODE_ENV === 'development') {
            console.log('✅ ReservationConfirmed event received (processing):', { 
                reservationKey, 
                processingReservations: Array.from(processingReservations) 
            });
        }
        
        if (!reservationKey) {
            console.error('❌ ReservationConfirmed event missing reservationKey:', args);
            return;
        }
        
        // Remove from processing
        setProcessingReservations(prev => {
            const newSet = new Set(prev);
            const hadKey = newSet.has(reservationKey);
            newSet.delete(reservationKey);
            
            if (process.env.NODE_ENV === 'development') {
                console.log('➖ Removing reservation key from processing:', { 
                    reservationKey, 
                    hadKey, 
                    remaining: Array.from(newSet) 
                });
            }
            
            return newSet;
        });
        
        // Show success notification
        addPersistentNotification('success', '✅ Reservation confirmed and recorded onchain!');
        
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
            console.log('[ReservationEventContext] Skipping ReservationRequestDenied event - manual update in progress');
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
        
        if (process.env.NODE_ENV === 'development') {
            console.log('❌ ReservationRequestDenied event received (processing):', { 
                reservationKey, 
                processingReservations: Array.from(processingReservations) 
            });
        }
        
        if (!reservationKey) {
            console.error('❌ ReservationRequestDenied event missing reservationKey:', args);
            return;
        }
        
        // Remove from processing
        setProcessingReservations(prev => {
            const newSet = new Set(prev);
            const hadKey = newSet.has(reservationKey);
            newSet.delete(reservationKey);
            
            if (process.env.NODE_ENV === 'development') {
                console.log('➖ Removing reservation key (denied):', { 
                    reservationKey, 
                    hadKey, 
                    remaining: Array.from(newSet) 
                });
            }
            
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
        const { renter, tokenId, start, end, reservationKey } = args;
        const eventKey = `ReservationRequested_${reservationKey}`;
        const now = Date.now();
        
        // Prevent duplicate processing of same event within 2 seconds
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);
        
        if (process.env.NODE_ENV === 'development') {
            console.log('� ReservationRequested event received (processing):', {
                renter,
                tokenId: tokenId?.toString(),
                start: start?.toString(),
                end: end?.toString(),
                reservationKey
            });
        }
        
        // Validate that all required arguments exist
        if (!reservationKey || !tokenId || !renter || !start || !end) {
            console.error('❌ ReservationRequested event missing required arguments:', args);
            return;
        }
        
        // Add to processing set
        setProcessingReservations(prev => {
            const newSet = new Set(prev).add(reservationKey);
            
            if (process.env.NODE_ENV === 'development') {
                console.log('➕ Adding reservation to processing:', { reservationKey, total: newSet.size });
            }
            
            return newSet;
        });

        try {
            // Get metadata URI from labs context
            const lab = labs?.find(lab => lab.id === tokenId.toString());
            
            if (!lab || !lab.uri) {
                console.error('❌ Lab not found in context or missing uri:', { 
                    labId: tokenId.toString(), 
                    availableLabs: labs?.map(l => ({ id: l.id, uri: l.uri })) 
                });
                throw new Error('Could not get metadata URI from labs context');
            }

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
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error processing reservation request:', error);
            
            // Remove from processing set on error
            setProcessingReservations(prev => {
                const newSet = new Set(prev);
                newSet.delete(reservationKey);
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('Removing reservation key (error):', { reservationKey, error: error.message });
                }
                
                return newSet;
            });
        }
    };

    // Enhanced BookingCanceled handler with collision prevention
    const handleBookingCanceled = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            console.log('[ReservationEventContext] Skipping BookingCanceled event - manual update in progress');
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
        
        if (process.env.NODE_ENV === 'development') {
            console.log('🗑️ BookingCanceled event received (processing):', { reservationKey });
        }
        
        if (!reservationKey) {
            console.error('❌ BookingCanceled event missing reservationKey:', args);
            return;
        }
        
        // Efficiently remove the canceled booking from existing state
        removeCanceledBooking(reservationKey);
        
        // Mark for smart batch update
        invalidateBookingCache(reservationKey);
        scheduleBookingUpdate(400); // Medium delay for canceled bookings
    };

    // Enhanced ReservationRequestCanceled handler with collision prevention
    const handleReservationRequestCanceled = (args) => {
        // Skip event processing if manual update is in progress
        if (manualUpdateInProgress) {
            console.log('[ReservationEventContext] Skipping ReservationRequestCanceled event - manual update in progress');
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
        
        if (process.env.NODE_ENV === 'development') {
            console.log('🗑️ ReservationRequestCanceled event received (processing):', { reservationKey });
        }
        
        if (!reservationKey) {
            console.error('❌ ReservationRequestCanceled event missing reservationKey:', args);
            return;
        }
        
        // Remove from processing set if it was there
        setProcessingReservations(prev => {
            const newSet = new Set(prev);
            newSet.delete(reservationKey);
            return newSet;
        });
        
        // Efficiently remove the canceled request from existing state
        removeCanceledBooking(reservationKey);
        
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
