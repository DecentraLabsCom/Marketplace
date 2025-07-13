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
    const { labs, setLabs, refetchLabs } = useLabs();

    // Handlers for each event
    function handleLabAdded(args) {
        if (process.env.NODE_ENV === 'development') {
            console.log('LabAdded event received:', args);
        }
        
        // Trigger a refetch of all labs to get the latest data
        refetchLabs();
    }

    function handleLabDeleted(args) {
        if (process.env.NODE_ENV === 'development') {
            console.log('LabDeleted event received:', args);
        }
        
        const deletedLabId = toIdString(args._labId);
        setLabs(prev => prev.filter(lab => toIdString(lab.id) !== deletedLabId));
    }

    function handleLabUpdated(args) {
        if (process.env.NODE_ENV === 'development') {
            console.log('LabUpdated event received:', args);
        }
        
        // Trigger a refetch to get the updated lab data
        refetchLabs();
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