"use client"
import { createContext, useContext, useState } from "react";
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

    // Listen for ReservationConfirmed events to update UI
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationConfirmed',
        onLogs(logs) {
            logs.forEach(log => {
                const { reservationKey } = log.args || {};
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('ReservationConfirmed event:', { reservationKey, processingReservations: Array.from(processingReservations) });
                }
                
                if (!reservationKey) {
                    console.error('ReservationConfirmed event missing reservationKey:', log);
                    return;
                }
                
                // Remove from processing
                setProcessingReservations(prev => {
                    const newSet = new Set(prev);
                    const hadKey = newSet.has(reservationKey);
                    newSet.delete(reservationKey);
                    
                    if (process.env.NODE_ENV === 'development') {
                        console.log('Removing reservation key:', { reservationKey, hadKey, remaining: Array.from(newSet) });
                    }
                    
                    return newSet;
                });
                
                // Show success notification
                addPersistentNotification('success', '✅ Reservation confirmed and recorded onchain!');
                
                // Refresh bookings to show the confirmed reservation
                fetchBookings();
            });
        },
    });

    // Listen for ReservationRequestDenied events to update UI
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequestDenied',
        onLogs(logs) {
            logs.forEach(log => {
                const { reservationKey } = log.args || {};
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('🔍 ReservationRequestDenied event:', { reservationKey, processingReservations: Array.from(processingReservations) });
                }
                
                if (!reservationKey) {
                    console.error('ReservationRequestDenied event missing reservationKey:', log);
                    return;
                }
                
                // Remove from processing
                setProcessingReservations(prev => {
                    const newSet = new Set(prev);
                    const hadKey = newSet.has(reservationKey);
                    newSet.delete(reservationKey);
                    
                    if (process.env.NODE_ENV === 'development') {
                        console.log('Removing reservation key (denied):', { reservationKey, hadKey, remaining: Array.from(newSet) });
                    }
                    
                    return newSet;
                });
                
                // Show denial notification
                addPersistentNotification('error', '❌ Reservation denied: Reservation outside allowed dates');
            });
        },
    });

    const handleReservationRequested = async (args) => {
        const { renter, tokenId, start, end, reservationKey } = args;
        
        if (process.env.NODE_ENV === 'development') {
            console.log('🔍 ReservationRequested event:', {
                renter,
                tokenId: tokenId?.toString(),
                start: start?.toString(),
                end: end?.toString(),
                reservationKey
            });
        }
        
        // Validate that all required arguments exist
        if (!reservationKey || !tokenId || !renter || !start || !end) {
            console.error('ReservationRequested event missing required arguments:', args);
            return;
        }
        
        // Add to processing set
        setProcessingReservations(prev => {
            const newSet = new Set(prev).add(reservationKey);
            
            if (process.env.NODE_ENV === 'development') {
                console.log('Adding reservation to processing:', { reservationKey, total: newSet.size });
            }
            
            return newSet;
        });

        try {
            // Get metadata URI from labs context
            const lab = labs?.find(lab => lab.id === tokenId.toString());
            
            if (!lab || !lab.uri) {
                console.error('Lab not found in context or missing uri:', { 
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

    // Listen for BookingCanceled events to update info
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'BookingCanceled',
        onLogs(logs) {
            logs.forEach(log => {
                const { reservationKey } = log.args || {};
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('BookingCanceled event:', { reservationKey });
                }
                
                if (!reservationKey) {
                    console.error('BookingCanceled event missing reservationKey:', log);
                    return;
                }
                
                // Efficiently remove the canceled booking from existing state
                removeCanceledBooking(reservationKey);
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
                const { reservationKey } = log.args || {};
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('ReservationRequestCanceled event:', { reservationKey });
                }
                
                if (!reservationKey) {
                    console.error('ReservationRequestCanceled event missing reservationKey:', log);
                    return;
                }
                
                // Efficiently remove the canceled booking from existing state
                removeCanceledBooking(reservationKey);
            });
        },
    });

    return (
        <ReservationEventContext.Provider value={{
            processingReservations
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
