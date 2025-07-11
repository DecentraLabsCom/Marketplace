"use client"
import { createContext, useContext, useEffect } from "react";
import { useWatchContractEvent } from 'wagmi';
//import { useLabs } from "./UserContext";
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";

const LabEventContext = createContext();

export function LabEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    //const { fetchLabs } = useLabs();

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderAdded',
        listener(log) {
            // TODO: Fetch all
            // TODO: Or just set labs with the new one, using logs.args
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderRemoved',
        listener(log) {
            // TODO: Fetch all
            // TODO: Or just set labs without the one deleted, using logs.args.labId to find it
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