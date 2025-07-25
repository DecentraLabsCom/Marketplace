"use client"
import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
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
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { labs } = useLabs();
    const { fetchUserBookings, fetchLabBookings, removeBooking, updateBookingStatus, confirmOptimisticBookingByEventData } = useBookings();
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
    
    // Store mapping of reservationKey to event data for precise optimistic booking updates
    const reservationEventData = useRef(new Map()); // Map<reservationKey, {labId, start, end, renter}>
    
    // Timeout tracking for pending reservations (auto-cleanup after 5 minutes)
    const pendingReservationTimeouts = useRef(new Map()); // Map<reservationKey, timeoutId>
    
    // Track failed event deliveries for pattern detection
    const eventFailureTracker = useRef({
        consecutiveFailures: 0,
        lastFailureTime: null,
        adaptiveTimeoutMinutes: 5 // Start with 5 minutes, can be adjusted
    });

    // Function to update both user and lab bookings for cross-user propagation
    const updateAllRelevantBookings = useCallback(async (labId, reason = 'event') => {
        if (!labId) {
            devLog.warn('[BookingEventContext] updateAllRelevantBookings: No labId provided');
            return;
        }
        
        devLog.log(`🔄 [BookingEventContext] Updating bookings for lab ${labId} (reason: ${reason})`);
        
        try {
            // Update user bookings (for current user)
            const userBookingsPromise = fetchUserBookings(true);
            
            // Update lab bookings (affects all users viewing this lab)
            const labBookingsPromise = fetchLabBookings(labId, true);
            
            // Execute both updates in parallel for efficiency
            await Promise.all([userBookingsPromise, labBookingsPromise]);
            
            devLog.log(`✅ [BookingEventContext] Successfully updated all bookings for lab ${labId}`);
        } catch (error) {
            devLog.error(`❌ [BookingEventContext] Failed to update bookings for lab ${labId}:`, error);
        }
    }, [fetchUserBookings, fetchLabBookings]);

    // Function to update ALL lab bookings when we don't have specific labId
    const updateAllLabBookings = useCallback(async (reason = 'event') => {
        devLog.log(`🔄 [BookingEventContext] Updating ALL lab bookings (reason: ${reason})`);
        
        try {
            // Get all unique lab IDs from current booking data and context
            const labIds = new Set();
            
            // Add lab IDs from labs context
            labs?.forEach(lab => {
                if (lab.id) labIds.add(lab.id.toString());
            });
            
            // Add lab IDs from stored event data
            reservationEventData.current.forEach(eventData => {
                if (eventData.labId) labIds.add(eventData.labId.toString());
            });
            
            devLog.log(`📊 [BookingEventContext] Found ${labIds.size} unique labs to update:`, Array.from(labIds));
            
            if (labIds.size === 0) {
                devLog.warn('[BookingEventContext] No lab IDs found for bulk update');
                return;
            }
            
            // Update user bookings once
            const userBookingsPromise = fetchUserBookings(true);
            
            // Update each lab's bookings
            const labBookingsPromises = Array.from(labIds).map(labId => 
                fetchLabBookings(labId, true).catch(error => {
                    devLog.error(`Failed to update lab ${labId}:`, error);
                    return null; // Don't fail the entire batch
                })
            );
            
            // Execute all updates in parallel
            await Promise.all([userBookingsPromise, ...labBookingsPromises]);
            
            devLog.log(`✅ [BookingEventContext] Successfully updated user bookings and ${labIds.size} lab bookings`);
        } catch (error) {
            devLog.error(`❌ [BookingEventContext] Failed to update all lab bookings:`, error);
        }
    }, [fetchUserBookings, fetchLabBookings, labs]);

    // Smart cache invalidation for booking-related updates
    const invalidateBookingCache = useCallback((reservationKey = null) => {
        if (reservationKey && reservationKey.startsWith('lab_')) {
            // Lab-specific invalidation (e.g., 'lab_123' for deleting all bookings of lab 123)
            const labId = reservationKey.replace('lab_', '');
            devLog.log(`🗑️ [BookingEventContext] Invalidating all bookings for lab ${labId}`);
            
            // Clear all cache keys that might contain this lab's bookings
            const cacheKeys = ['bookings_', 'labs_timestamp', `lab_bookings_${labId}`];
            cacheKeys.forEach(key => {
                Object.keys(sessionStorage).forEach(storageKey => {
                    if (storageKey.startsWith(key)) {
                        sessionStorage.removeItem(storageKey);
                    }
                });
            });
            
        } else if (reservationKey) {
            // Selective invalidation - mark specific reservation for update
            pendingBookingUpdates.current.add(reservationKey);
        } else {
            // Full invalidation - clear all booking cache (but preserve labs cache)
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
    const scheduleBookingUpdate = useCallback((delay = 300, labId = null) => {
        if (bookingUpdateTimeoutRef.current) {
            clearTimeout(bookingUpdateTimeoutRef.current);
        }
        
        bookingUpdateTimeoutRef.current = setTimeout(() => {
            if (pendingBookingUpdates.current.size > 0) {
                devLog.log('📊 Processing batch booking updates for keys:', Array.from(pendingBookingUpdates.current));
                pendingBookingUpdates.current.clear();
                
                if (labId) {
                    // Update both user and lab bookings for cross-user propagation
                    updateAllRelevantBookings(labId, 'batch_update');
                } else {
                    // No specific lab ID - update all lab bookings to ensure cross-user propagation
                    updateAllLabBookings('batch_update_all');
                }
            }
        }, delay);
    }, [updateAllRelevantBookings, updateAllLabBookings]);

    // Enhanced timeout and fallback system for stuck reservations
    const setupReservationTimeout = useCallback((reservationKey, labId, timeoutMinutes = null) => {
        // Use adaptive timeout based on recent failure patterns
        const adaptiveTimeout = timeoutMinutes || eventFailureTracker.current.adaptiveTimeoutMinutes;
        
        // Clear any existing timeout for this reservation
        if (pendingReservationTimeouts.current.has(reservationKey)) {
            clearTimeout(pendingReservationTimeouts.current.get(reservationKey));
        }

        // Set new timeout
        const timeoutId = setTimeout(async () => {
            devLog.warn(`⏰ Reservation timeout reached for ${reservationKey} after ${adaptiveTimeout} minutes`);
            
            // Track this as a potential failure
            eventFailureTracker.current.consecutiveFailures++;
            eventFailureTracker.current.lastFailureTime = Date.now();
            
            // Adjust adaptive timeout for future reservations (max 10 minutes)
            if (eventFailureTracker.current.consecutiveFailures >= 3) {
                eventFailureTracker.current.adaptiveTimeoutMinutes = Math.min(10, adaptiveTimeout + 2);
                devLog.warn(`📈 Increasing adaptive timeout to ${eventFailureTracker.current.adaptiveTimeoutMinutes} minutes due to consecutive failures`);
            }
            
            // Check if reservation is still in processing state
            if (processingReservations.has(reservationKey)) {
                devLog.warn(`🔄 Forcing blockchain refetch for stuck reservation: ${reservationKey}`);
                
                // Remove from processing state
                setProcessingReservations(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(reservationKey);
                    devLog.log(`🧹 Removed stuck reservation from processing: ${reservationKey}`);
                    return newSet;
                });
                
                // Force complete cache invalidation and blockchain refetch
                invalidateBookingCache();
                
                // Trigger comprehensive update
                if (labId) {
                    await updateAllRelevantBookings(labId, 'timeout_fallback');
                } else {
                    await updateAllLabBookings('timeout_fallback');
                }
                
                // Show user notification about the fallback
                addPersistentNotification('warning', 
                    '⚠️ Reservation status updated from blockchain due to delayed confirmation.'
                );
            }
            
            // Clean up
            pendingReservationTimeouts.current.delete(reservationKey);
            reservationEventData.current.delete(reservationKey);
            
        }, adaptiveTimeout * 60 * 1000); // Convert minutes to milliseconds
        
        // Store timeout ID for cleanup
        pendingReservationTimeouts.current.set(reservationKey, timeoutId);
        
        devLog.log(`⏰ Set ${adaptiveTimeout}min timeout for reservation: ${reservationKey}`);
    }, [processingReservations, invalidateBookingCache, updateAllRelevantBookings, updateAllLabBookings, addPersistentNotification]);

    // Clean up timeout when reservation is resolved
    const clearReservationTimeout = useCallback((reservationKey) => {
        if (pendingReservationTimeouts.current.has(reservationKey)) {
            clearTimeout(pendingReservationTimeouts.current.get(reservationKey));
            pendingReservationTimeouts.current.delete(reservationKey);
            devLog.log(`🧹 Cleared timeout for resolved reservation: ${reservationKey}`);
            
            // Reset failure counter on successful event delivery
            if (eventFailureTracker.current.consecutiveFailures > 0) {
                eventFailureTracker.current.consecutiveFailures = Math.max(0, eventFailureTracker.current.consecutiveFailures - 1);
                
                // Gradually reduce adaptive timeout back to normal (minimum 3 minutes)
                if (eventFailureTracker.current.consecutiveFailures === 0) {
                    eventFailureTracker.current.adaptiveTimeoutMinutes = Math.max(3, eventFailureTracker.current.adaptiveTimeoutMinutes - 1);
                    devLog.log(`📉 Reduced adaptive timeout to ${eventFailureTracker.current.adaptiveTimeoutMinutes} minutes after successful event`);
                }
            }
        }
    }, []);

    // Proactive stuck reservation detection (runs every 2 minutes)
    const checkStuckReservations = useCallback(async () => {
        if (processingReservations.size === 0) return;
        
        devLog.log(`🔍 Checking ${processingReservations.size} processing reservations for stuck state...`);
        
        const stuckThreshold = 3 * 60 * 1000; // 3 minutes in milliseconds
        const now = Date.now();
        
        // Check each processing reservation
        for (const reservationKey of processingReservations) {
            const eventData = reservationEventData.current.get(reservationKey);
            
            if (eventData) {
                // Check if reservation has been processing for too long
                const processingTime = now - (eventData.timestamp || now);
                
                if (processingTime > stuckThreshold) {
                    devLog.warn(`⚠️ Detected stuck reservation (${Math.round(processingTime/1000/60)}min): ${reservationKey}`);
                    
                    try {
                        // Force blockchain check for this specific reservation
                        const response = await fetch('/api/contract/reservation/checkReservationStatus', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reservationKey })
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            
                            if (result.status !== 'pending') {
                                devLog.log(`🔄 Found resolved status for stuck reservation: ${reservationKey} -> ${result.status}`);
                                
                                // Remove from processing and trigger update
                                setProcessingReservations(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(reservationKey);
                                    return newSet;
                                });
                                
                                // Trigger comprehensive refresh
                                invalidateBookingCache();
                                await updateAllRelevantBookings(eventData.labId, 'stuck_resolution');
                                
                                // Clean up
                                clearReservationTimeout(reservationKey);
                            }
                        }
                    } catch (error) {
                        devLog.warn(`Failed to check stuck reservation ${reservationKey}:`, error);
                    }
                }
            }
        }
    }, [processingReservations, invalidateBookingCache, updateAllRelevantBookings, clearReservationTimeout]);

    // Set up periodic stuck reservation checking
    useEffect(() => {
        const interval = setInterval(checkStuckReservations, 2 * 60 * 1000); // Every 2 minutes
        return () => clearInterval(interval);
    }, [checkStuckReservations]);

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
            fullArgs: args, // Log all args to see what's available
            processingReservations: Array.from(processingReservations) 
        });
        
        if (!reservationKey) {
            devLog.error('❌ ReservationConfirmed event missing reservationKey:', args);
            return;
        }
        
        // Get stored event data to check if this is current user's reservation
        const confirmedEventData = reservationEventData.current.get(reservationKey);
        const isCurrentUserReservation = confirmedEventData && address && 
            confirmedEventData.renter.toLowerCase() === address.toLowerCase();
        
        // Remove from processing ONLY if it's the current user's reservation
        if (isCurrentUserReservation) {
            setProcessingReservations(prev => {
                const newSet = new Set(prev);
                const hadKey = newSet.has(reservationKey);
                newSet.delete(reservationKey);
                
                devLog.log('➖ Removing reservation key from processing (current user):', { 
                    reservationKey, 
                    hadKey, 
                    remaining: Array.from(newSet),
                    currentUser: address 
                });
                
                return newSet;
            });
            
            // Clear timeout since reservation is now confirmed
            clearReservationTimeout(reservationKey);
        } else {
            devLog.log('ℹ️ Skipping processing removal for other user:', { 
                reservationKey, 
                eventDataRenter: confirmedEventData?.renter, 
                currentUser: address 
            });
        }
        
        // Update optimistic booking status to confirmed (status: "1")
        try {
            // Get stored event data for precise matching (reuse confirmedEventData from above)
            const eventData = confirmedEventData;
            
            if (eventData) {
                // Use precise matching with stored event data
                const success = confirmOptimisticBookingByEventData(
                    eventData.labId, 
                    eventData.start, 
                    eventData.end, 
                    reservationKey, 
                    "1"
                );
                
                if (success) {
                    devLog.log('✅ Successfully confirmed optimistic booking using event data:', { 
                        reservationKey, eventData 
                    });
                    
                    // Update lab bookings for cross-user propagation
                    // This ensures that other users (like providers) see the new booking
                    updateAllRelevantBookings(eventData.labId, 'reservation_confirmed');
                } else {
                    devLog.warn('⚠️ Failed to find optimistic booking, triggering blockchain refetch');
                    
                    // Force cache invalidation and refetch from blockchain
                    invalidateBookingCache(reservationKey);
                    scheduleBookingUpdate(100, eventData.labId); // Pass labId for cross-user update
                }
                
                // Clean up stored event data
                reservationEventData.current.delete(reservationKey);
            } else {
                devLog.warn('⚠️ No stored event data found, trying alternative approach:', { reservationKey });
                
                // Alternative approach: try to find and update any optimistic booking with this reservationKey
                // This can happen if events arrive out of order
                let foundAndUpdated = false;
                
                // Try to update by reservationKey directly (for existing optimistic bookings)
                try {
                    updateBookingStatus(reservationKey, "1");
                    foundAndUpdated = true;
                    devLog.log('✅ Updated booking by reservationKey directly:', { reservationKey });
                } catch (error) {
                    devLog.warn('⚠️ Could not update by reservationKey, forcing full refetch:', error);
                }
                
                if (!foundAndUpdated) {
                    // Force cache invalidation and refetch from blockchain
                    invalidateBookingCache(reservationKey);
                    scheduleBookingUpdate(100); // Quick refetch to get real blockchain data
                    devLog.warn('🔄 Forced full blockchain refetch due to missing event data');
                }
            }
        } catch (error) {
            devLog.error('Failed to confirm optimistic booking, triggering blockchain refetch:', error);
            
            // Force cache invalidation and refetch from blockchain
            invalidateBookingCache(reservationKey);
            scheduleBookingUpdate(100); // Quick refetch to get real blockchain data
        }
        
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
        
        // NOTE: Skipping automatic refetch since optimistic update already handled the state change
        // Mark for smart batch update - but delay it to avoid overwriting optimistic update
        invalidateBookingCache(reservationKey);
        // scheduleBookingUpdate(500); // Commented out - optimistic update is sufficient
        
        devLog.log('✅ ReservationConfirmed handled optimistically, skipping immediate refetch');
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
        
        // Get stored event data to check if this is current user's reservation
        const deniedEventData = reservationEventData.current.get(reservationKey);
        const isCurrentUserReservation = deniedEventData && address && 
            deniedEventData.renter.toLowerCase() === address.toLowerCase();
        
        // Remove from processing ONLY if it's the current user's reservation
        if (isCurrentUserReservation) {
            setProcessingReservations(prev => {
                const newSet = new Set(prev);
                const hadKey = newSet.has(reservationKey);
                newSet.delete(reservationKey);
                
                devLog.log('➖ Removing reservation key (denied - current user):', { 
                    reservationKey, 
                    hadKey, 
                    remaining: Array.from(newSet),
                    currentUser: address 
                });
                
                return newSet;
            });
            
            // Clear timeout since reservation is now denied
            clearReservationTimeout(reservationKey);
        } else {
            devLog.log('ℹ️ Skipping processing removal for other user (denied):', { 
                reservationKey, 
                eventDataRenter: deniedEventData?.renter, 
                currentUser: address 
            });
        }
        
        // Show denial notification
        addPersistentNotification('error', '❌ Reservation denied: Reservation outside allowed dates');
        
        // Get stored event data to update the correct lab (reuse deniedEventData from above)
        const eventData = deniedEventData;
        
        // Mark for smart batch update (cleanup denied reservations)
        invalidateBookingCache(reservationKey);
        if (eventData && eventData.labId) {
            scheduleBookingUpdate(300, eventData.labId); // Cross-user update with labId
            // Clean up stored event data
            reservationEventData.current.delete(reservationKey);
        } else {
            scheduleBookingUpdate(300); // Fallback without labId
        }
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
        
        // Store event data for precise optimistic booking matching
        reservationEventData.current.set(reservationKey, {
            labId: tokenId.toString(),
            start: parseInt(start.toString()),
            end: parseInt(end.toString()),
            renter: renter.toString(),
            timestamp: Date.now() // Add timestamp for stuck detection
        });
        
        devLog.log('📝 Stored reservation event data for mapping:', { 
            reservationKey, 
            data: reservationEventData.current.get(reservationKey) 
        });
        
        // Add to processing set ONLY if it's the current user's reservation
        if (address && renter.toString().toLowerCase() === address.toLowerCase()) {
            setProcessingReservations(prev => {
                const newSet = new Set(prev).add(reservationKey);
                
                devLog.log('➕ Adding reservation to processing (current user):', { reservationKey, total: newSet.size, currentUser: address });
                
                return newSet;
            });
            
            // Set up timeout for automatic fallback (adaptive timeout)
            setupReservationTimeout(reservationKey, tokenId.toString());
        } else {
            devLog.log('ℹ️ Skipping processing notification for other user:', { 
                reservationKey, 
                renter: renter.toString(), 
                currentUser: address 
            });
        }

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
                
                // Trigger booking updates to show the pending reservation for all users
                invalidateBookingCache(reservationKey);
                scheduleBookingUpdate(200, tokenId.toString()); // Pass labId for cross-user update
                
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
            
            // Clear timeout on error
            clearReservationTimeout(reservationKey);
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
        
        // For canceled bookings, we need to ensure cross-user propagation
        // Since we don't have labId directly, we'll update all lab bookings
        invalidateBookingCache(reservationKey);
        
        // Try to get labId from stored event data first
        let labIdForUpdate = null;
        reservationEventData.current.forEach((eventData, key) => {
            if (key === reservationKey || eventData.renter === args?.renter) {
                labIdForUpdate = eventData.labId;
            }
        });
        
        if (labIdForUpdate) {
            scheduleBookingUpdate(400, labIdForUpdate); // Update specific lab
            devLog.log('🔄 Scheduled targeted cross-user update for booking cancellation:', { reservationKey, labId: labIdForUpdate });
        } else {
            // Fallback: update all lab bookings to ensure cross-user propagation
            scheduleBookingUpdate(400); // This will trigger updateAllLabBookings
            devLog.log('🔄 Scheduled comprehensive cross-user update for booking cancellation:', { reservationKey });
        }
        
        // Clean up any stored event data for this reservation
        reservationEventData.current.delete(reservationKey);
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
        
        // Get stored event data for cross-user propagation
        const eventData = reservationEventData.current.get(reservationKey);
        
        // Mark for smart batch update
        invalidateBookingCache(reservationKey);
        if (eventData && eventData.labId) {
            scheduleBookingUpdate(300, eventData.labId); // Cross-user update with labId
            // Clean up stored event data
            reservationEventData.current.delete(reservationKey);
            devLog.log('🔄 Scheduled targeted cross-user update for request cancellation:', { reservationKey, labId: eventData.labId });
        } else {
            // Fallback: update all lab bookings to ensure cross-user propagation
            scheduleBookingUpdate(300); // This will trigger updateAllLabBookings
            devLog.log('🔄 Scheduled comprehensive cross-user update for request cancellation:', { reservationKey });
        }
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
            updateAllRelevantBookings,
            updateAllLabBookings,
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
