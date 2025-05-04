"use client"
import { createContext, useContext, useEffect } from "react";
import { useWatchContractEvent } from 'wagmi';
import { useLabs } from "./LabContext";
import { contractABI, contractAddresses } from '../contracts/diamond';
import { selectChain } from '../utils/selectChain';
import { useAccount } from "wagmi";

const LabEventContext = createContext();

export function LabEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const { fetchLabs } = useLabs();
    const { fetchBookings } = useLabs();

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabAdded',
        listener(log) {
            // Fetch all
            fetchLabs();
            // TODO: Or just set labs with the new one, using logs.args
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        listener(log) {
            // Fetch all
            fetchLabs();
            // TODO: Or just set labs without the one deleted, using logs.args.labId to find it
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUpdated',
        listener(log) {
            // Fetch all
            fetchLabs();
            // TODO: Or just set labs without the updated one, using logs.args.labId to find it and update the attributes
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationAdded',
        listener(log) {
            // Fetch all
            fetchBookings();
            // TODO: Or just set labs with the new one, using logs.args
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ReservationDeleted',
        listener(log) {
            // Fetch all
            fetchBookings();
            // TODO: Or just set labs without the updated reservation, using logs.args.labId to find it and update the attributes
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