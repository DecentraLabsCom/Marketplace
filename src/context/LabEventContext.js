"use client"
import { createContext, useContext, useRef, useCallback, useState } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { useBookings } from "@/context/BookingContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import devLog from '@/utils/logger';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";

function toIdString(id) {
    if (typeof id === "bigint") return id.toString();
    if (typeof id === "number") return id.toString();
    if (typeof id === "string") return id;
    return String(id);
}

const LabEventContext = createContext();

export function LabEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { setLabs, fetchLabs } = useLabs();
    const { fetchUserBookings } = useBookings();

    // Debouncing and state management for intelligent updates
    const lastEventTime = useRef(new Map()); // Track last event time by type
    const pendingUpdates = useRef(new Set()); // Track pending lab IDs for updates
    const updateTimeoutRef = useRef(null);

    // Manual update tracking for coordination (useState for reactivity)
    const [manualUpdateInProgress, setManualUpdateInProgressState] = useState(false);
    const manualUpdateTimeout = useRef(null);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    // Function to set manual update in progress
    const setManualUpdateInProgress = useCallback((inProgress, duration = 3000) => {
        setManualUpdateInProgressState(inProgress);
        
        if (inProgress) {
            // Clear existing timeout
            if (manualUpdateTimeout.current) {
                clearTimeout(manualUpdateTimeout.current);
            }
            
            // Auto-clear after duration
            manualUpdateTimeout.current = setTimeout(() => {
                setManualUpdateInProgressState(false);
                devLog.log('🕒 Manual update timeout cleared');
            }, duration);
        } else {
            // Clear timeout immediately
            if (manualUpdateTimeout.current) {
                clearTimeout(manualUpdateTimeout.current);
                manualUpdateTimeout.current = null;
            }
        }
    }, []);

    // Smart cache invalidation - preserves sessionStorage timestamps
    const invalidateLabCache = useCallback((labId = null) => {
        if (labId) {
            // Selective invalidation - mark specific lab as needing update
            pendingUpdates.current.add(labId);
        } else {
            // Full invalidation - clear all cache
            sessionStorage.removeItem('labs');
            sessionStorage.removeItem('labs_timestamp');
        }
    }, []);

    // Debounced batch update for multiple lab changes
    const scheduleLabsUpdate = useCallback((delay = 500) => {
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        
        updateTimeoutRef.current = setTimeout(() => {
            if (pendingUpdates.current.size > 0) {
                devLog.log('Processing batch lab updates for IDs:', Array.from(pendingUpdates.current));
                pendingUpdates.current.clear();
                fetchLabs();
            }
        }, delay);
    }, [fetchLabs]);

    // Enhanced event handlers with collision prevention
    async function handleLabAdded(args) {
        const eventKey = `LabAdded_${args._labId}`;
        const now = Date.now();
        
        // Prevent duplicate processing of same event within 2 seconds
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);

        // ✅ CHECK: Skip if manual update is in progress
        if (isManualUpdateInProgress) {
            devLog.log('⏸️ Skipping LabAdded event - manual update in progress:', args._labId);
            return;
        }

        devLog.log('🔥 LabAdded event received (processing):', args);
        
        try {
            const labId = toIdString(args._labId);
            
            // Build the new lab object from event data
            const newLab = {
                id: labId,
                provider: args._provider,
                uri: args._uri,
                price: args._price?.toString() || "0",
                auth: args._auth || "",
                accessURI: args._accessURI || "",
                accessKey: args._accessKey || "",
                bookingInfo: [], // Empty initially
                userBookings: [] // Empty initially
            };

            // If we have a metadata URI, try to fetch additional metadata
            if (args._uri) {
                try {
                    const metadataResponse = await fetch(args._uri);
                    if (metadataResponse.ok) {
                        const metadata = await metadataResponse.json();
                        // Merge metadata into the lab object
                        Object.assign(newLab, metadata);
                    }
                } catch (metadataError) {
                    devLog.warn('Could not fetch metadata for new lab:', metadataError);
                }
            }

            // Smart state update - prevent duplicates and handle concurrent updates
            setLabs(prev => {
                const existingLabIndex = prev.findIndex(lab => toIdString(lab.id) === labId);
                if (existingLabIndex !== -1) {
                    // Update existing lab instead of adding duplicate
                    const updatedLabs = [...prev];
                    updatedLabs[existingLabIndex] = { 
                        ...updatedLabs[existingLabIndex], 
                        ...newLab,
                        // Preserve existing booking data if available
                        bookingInfo: updatedLabs[existingLabIndex].bookingInfo || [],
                        userBookings: updatedLabs[existingLabIndex].userBookings || []
                    };
                    return updatedLabs;
                } else {
                    // Add new lab
                    return [...prev, newLab];
                }
            });

            // Update cache timestamp to prevent unnecessary fetches
            invalidateLabCache(labId);

            devLog.log('✅ Successfully processed LabAdded event:', newLab);    
        } catch (error) {
            devLog.error('❌ Error handling LabAdded event:', error);
            // Fallback: schedule a delayed full refresh instead of immediate
            scheduleLabsUpdate(1000);
        }
    }

    function handleLabDeleted(args) {
        const eventKey = `LabDeleted_${args._labId}`;
        const now = Date.now();
        
        // Prevent duplicate processing
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);

        // ✅ CHECK: Skip if manual update is in progress
        if (isManualUpdateInProgress) {
            devLog.log('⏸️ Skipping LabDeleted event - manual update in progress:', args._labId);
            return;
        }

        devLog.log('🗑️ LabDeleted event received (processing):', args);
        
        const deletedLabId = toIdString(args._labId);
        
        // Remove the lab from the labs array
        setLabs(prev => {
            const filteredLabs = prev.filter(lab => toIdString(lab.id) !== deletedLabId);
            
            // Only update cache if there was actually a change
            if (filteredLabs.length !== prev.length) {
                invalidateLabCache(deletedLabId);
                devLog.log('✅ Successfully removed lab from state:', deletedLabId);
            }
            
            return filteredLabs;
        });
        
        // Force refresh user bookings to get updated data
        fetchUserBookings(true);
    }

    function handleLabUpdated(args) {
        const eventKey = `LabUpdated_${args._labId}`;
        const now = Date.now();
        
        // Prevent duplicate processing and batch multiple updates
        if (lastEventTime.current.has(eventKey) && 
            now - lastEventTime.current.get(eventKey) < 2000) {
            return;
        }
        lastEventTime.current.set(eventKey, now);

        // ✅ CHECK: Skip if manual update is in progress
        if (isManualUpdateInProgress) {
            devLog.log('⏸️ Skipping LabUpdated event - manual update in progress:', args._labId);
            return;
        }

        devLog.log('📝 LabUpdated event received (scheduling update):', args);
        
        const labId = toIdString(args._labId);
        
        // Mark this lab for update and schedule batch processing
        pendingUpdates.current.add(labId);
        invalidateLabCache(labId);
        
        // Use debounced update to batch multiple rapid changes
        scheduleLabsUpdate(1500); // Slightly longer delay for updates to batch them
    }

    // Listen for LabAdded events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabAdded',
        onLogs(logs) {
            logs.forEach(log => {
                handleLabAdded(log.args);
            });
        },
    });

    // Listen for LabDeleted events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        onLogs(logs) {
            logs.forEach(log => {
                handleLabDeleted(log.args);
            });
        },
    });

    // Listen for LabUpdated events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUpdated',
        onLogs(logs) {
            logs.forEach(log => {
                handleLabUpdated(log.args);
            });
        },
    });

    return (
        <LabEventContext.Provider value={{ 
            invalidateLabCache,
            scheduleLabsUpdate,
            isManualUpdateInProgress,
            setManualUpdateInProgress,
            pendingUpdates: pendingUpdates.current
        }}>
            {children}
        </LabEventContext.Provider>
    );
}

export function useLabEvents() {
    return useContext(LabEventContext);
}