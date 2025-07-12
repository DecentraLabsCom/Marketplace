"use client"
import { createContext, useContext, useState } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { useNotifications } from "@/context/NotificationContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";

// Helper function to parse hex data manually
const parseReservationRequestedData = (data) => {
    try {
        // Remove 0x prefix and split into 32-byte chunks
        const cleanData = data.slice(2);
        const chunks = [];
        for (let i = 0; i < cleanData.length; i += 64) {
            chunks.push(cleanData.slice(i, i + 64));
        }
        
        if (chunks.length >= 5) {
            // Parse based on the event structure:
            // renter (address) - 32 bytes, but address is last 20 bytes
            const renter = '0x' + chunks[0].slice(24); // Remove padding, get last 20 bytes
            
            // tokenId (uint256) - 32 bytes
            const tokenId = BigInt('0x' + chunks[1]);
            
            // start (uint256) - 32 bytes  
            const start = BigInt('0x' + chunks[2]);
            
            // end (uint256) - 32 bytes
            const end = BigInt('0x' + chunks[3]);
            
            // reservationKey (bytes32) - 32 bytes
            const reservationKey = '0x' + chunks[4];
            
            return {
                renter,
                tokenId,
                start,
                end,
                reservationKey
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error parsing reservation data:', error);
        return null;
    }
};

const ReservationEventContext = createContext();

export function ReservationEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { fetchBookings, labs } = useLabs();
    const { addPersistentNotification } = useNotifications();
    const [processingReservations, setProcessingReservations] = useState(new Set());

    // Listen for ReservationRequested events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        onLogs(logs) {
            logs.forEach(log => {
                // If args is empty, try to parse manually from topics and data
                if (!log.args || Object.keys(log.args).length === 0) {
                    const parsedData = parseReservationRequestedData(log.data);
                    if (parsedData) {
                        handleReservationRequested(parsedData);
                        return;
                    }
                }
                
                handleReservationRequested(log.args);
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
                // The reservationKey is in log.data
                const reservationKey = log.data;
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('ReservationConfirmed event:', { reservationKey, processingReservations: Array.from(processingReservations) });
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
                addPersistentNotification('success', '✅ Reservation confirmed and booked successfully!');
                
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
                // The reservationKey is in log.data
                const reservationKey = log.data;
                const reason = log.args?.reason || 'Reservation outside allowed dates';
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('ReservationRequestDenied event:', { reservationKey, reason, processingReservations: Array.from(processingReservations) });
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
                
                // Show denial notification with reason
                addPersistentNotification('error', `❌ Reservation denied: ${reason}`);
            });
        },
    });

    const handleReservationRequested = async (args) => {
        // The ReservationRequested event has these parameters:
        // - renter (indexed, address) 
        // - tokenId (indexed, uint256) - this is the labId
        // - start (uint256)
        // - end (uint256) 
        // - reservationKey (bytes32)
        
        let reservationKey, labId, user, start, end;
        
        if (Array.isArray(args)) {
            // If args is an array, extract by position
            [user, labId, start, end, reservationKey] = args;
        } else if (args && typeof args === 'object') {
            // If args is an object, extract by property names matching the ABI
            const { renter, tokenId, start: startTime, end: endTime, reservationKey: resKey } = args;
            user = renter;
            labId = tokenId;
            start = startTime;
            end = endTime;
            reservationKey = resKey;
            
            // Sometimes the args might be numbered (0, 1, 2, etc.)
            if (!user && args[0] !== undefined) {
                user = args[0];
                labId = args[1];
                start = args[2];
                end = args[3];
                reservationKey = args[4];
            }
        }
        
        // Validate that all required arguments exist
        if (!reservationKey || !labId || !user || !start || !end) {
            console.error('ReservationRequested event missing required arguments:', {
                reservationKey,
                labId,
                user,
                start,
                end,
                originalArgs: args
            });
            return;
        }
        
        // Add to processing set
        setProcessingReservations(prev => {
            const newSet = new Set(prev).add(reservationKey);
            
            if (process.env.NODE_ENV === 'development') {
                console.log('Adding reservation to processing:', { reservationKey, total: newSet.size, allKeys: Array.from(newSet) });
            }
            
            return newSet;
        });

        try {
            // Get metadata URI from labs context
            const lab = labs?.find(lab => lab.id === labId.toString());
            
            if (!lab || !lab.uri) {
                console.error('Lab not found in context or missing uri:', { labId: labId.toString(), availableLabs: labs?.map(l => ({ id: l.id, uri: l.uri })) });
                throw new Error('Could not get metadata URI from labs context');
            }
            
            const metadataUri = lab.uri;

            // Process the reservation request via API
            const response = await fetch('/api/contract/reservation/processReservationRequest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    reservationKey: reservationKey,
                    labId: labId.toString(),
                    start: start.toString(),
                    end: end.toString(),
                    metadataUri: metadataUri
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

        } catch (error) {
            console.error('Error processing reservation request:', error);
            
            // Remove from processing set on error
            setProcessingReservations(prev => {
                const newSet = new Set(prev);
                const hadKey = newSet.has(reservationKey);
                newSet.delete(reservationKey);
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('Removing reservation key (error):', { reservationKey, hadKey, error: error.message });
                }
                
                return newSet;
            });
        }
    };

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
