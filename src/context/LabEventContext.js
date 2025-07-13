"use client"
import { createContext, useContext } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
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
    const { setLabs, fetchLabs, removeBookingsForDeletedLab } = useLabs();

    // Handlers for each event
    async function handleLabAdded(args) {
        if (process.env.NODE_ENV === 'development') {
            console.log('LabAdded event received:', args);
        }
        
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
                    console.warn('Could not fetch metadata for new lab:', metadataError);
                }
            }

            // Add the new lab to the state
            setLabs(prev => {
                // Check if lab already exists to avoid duplicates
                const existingLabIndex = prev.findIndex(lab => toIdString(lab.id) === labId);
                if (existingLabIndex !== -1) {
                    // Update existing lab instead of adding duplicate
                    const updatedLabs = [...prev];
                    updatedLabs[existingLabIndex] = { ...updatedLabs[existingLabIndex], ...newLab };
                    return updatedLabs;
                } else {
                    // Add new lab
                    return [...prev, newLab];
                }
            });

            if (process.env.NODE_ENV === 'development') {
                console.log('Successfully added new lab to state:', newLab);
            }
            
        } catch (error) {
            console.error('Error handling LabAdded event:', error);
            // Fallback: use fetchLabs to refresh all data
            fetchLabs();
        }
    }

    function handleLabDeleted(args) {
        if (process.env.NODE_ENV === 'development') {
            console.log('LabDeleted event received:', args);
        }
        
        const deletedLabId = toIdString(args._labId);
        
        // Remove the lab from the labs array
        setLabs(prev => prev.filter(lab => toIdString(lab.id) !== deletedLabId));
        
        // Remove all bookings/reservations for this deleted lab
        removeBookingsForDeletedLab(deletedLabId);
    }

    function handleLabUpdated(args) {
        if (process.env.NODE_ENV === 'development') {
            console.log('LabUpdated event received:', args);
        }
        
        // Trigger a refetch to get the updated lab data
        fetchLabs();
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
        <LabEventContext.Provider value={{}}>
            {children}
        </LabEventContext.Provider>
    );
}

export function useLabEvents() {
    return useContext(LabEventContext);
}