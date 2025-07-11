"use client"
import { createContext, useContext, useEffect, useState } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";

const ReservationEventContext = createContext();

export function ReservationEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { fetchBookings } = useLabs();
    const [processingReservations, setProcessingReservations] = useState(new Set());

    // Listen for ReservationRequested events
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationRequested',
        onLogs(logs) {
            logs.forEach(log => handleReservationRequested(log.args));
        },
    });

    // Listen for ReservationConfirmed events to update UI
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationConfirmed',
        onLogs(logs) {
            logs.forEach(log => {
                console.log('ReservationConfirmed event:', log.args);
                const reservationKey = log.args.reservationKey;
                setProcessingReservations(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(reservationKey);
                    return newSet;
                });
                // Refresh bookings to show the confirmed reservation
                fetchBookings();
            });
        },
    });

    // Listen for ReservationDenied events to update UI
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationDenied',
        onLogs(logs) {
            logs.forEach(log => {
                console.log('ReservationDenied event:', log.args);
                const reservationKey = log.args.reservationKey;
                setProcessingReservations(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(reservationKey);
                    return newSet;
                });
                // Optionally show a notification about the denied reservation
            });
        },
    });

    const handleReservationRequested = async (args) => {
        const { reservationKey, labId, user, start, end } = args;
        
        console.log('ReservationRequested event received:', {
            reservationKey: reservationKey,
            labId: labId.toString(),
            user: user,
            start: start.toString(),
            end: end.toString()
        });

        // Add to processing set
        setProcessingReservations(prev => new Set(prev).add(reservationKey));

        try {
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
                    end: end.toString()
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Reservation processing result:', result);

        } catch (error) {
            console.error('Error processing reservation request:', error);
            
            // Remove from processing set on error
            setProcessingReservations(prev => {
                const newSet = new Set(prev);
                newSet.delete(reservationKey);
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
