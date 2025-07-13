"use client"
import { createContext, useContext } from "react";
import { useWatchContractEvent } from 'wagmi';
import { contractABI, contractAddresses } from '@/contracts/diamond';
import { selectChain } from '@/utils/selectChain';
import { useAccount } from "wagmi";
import { useUser } from './UserContext';
import { useNotifications } from './NotificationContext';

const UserEventContext = createContext();

export function UserEventProvider({ children }) {
    const { chain, address: userAddress } = useAccount();
    const { user, isSSO, refreshProviderStatus } = useUser();
    const { addPersistentNotification } = useNotifications();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderAdded',
        listener(logs) {
            logs.forEach(log => {
                const { _account, _name, _email, _country } = log.args;
                
                // Check if this event affects the current user
                const affectsCurrentUser = isSSO ? 
                    (user?.email && _email === user.email) : 
                    (userAddress && _account.toLowerCase() === userAddress.toLowerCase());
                
                if (affectsCurrentUser) {
                    // Current user became a provider
                    addPersistentNotification('success', `🎉 Welcome as a new provider, ${_name}!`);
                    // Refresh provider status to update UI
                    if (typeof refreshProviderStatus === 'function') {
                        refreshProviderStatus();
                    }
                } else {
                    // Another user became a provider
                    addPersistentNotification('info', `🏢 New provider joined: ${_name} from ${_country}`);
                }
            });
        },
    });

    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderRemoved',
        listener(logs) {
            logs.forEach(log => {
                const { _account } = log.args;
                
                // Check if this event affects the current user
                const affectsCurrentUser = isSSO ? 
                    false : // SSO providers are managed differently, this event likely doesn't apply
                    (userAddress && _account.toLowerCase() === userAddress.toLowerCase());
                
                if (affectsCurrentUser) {
                    // Current user lost provider status
                    addPersistentNotification('warning', '⚠️ Your provider status has been removed');
                    // Refresh provider status to update UI
                    if (typeof refreshProviderStatus === 'function') {
                        refreshProviderStatus();
                    }
                } else {
                    // Another provider was removed
                    addPersistentNotification('info', '📢 A provider has been removed from the network');
                }
            });
        },
    });

    return (
        <UserEventContext.Provider value={{}}>
          {children}
        </UserEventContext.Provider>
    );
}

export function useUserEvents() {
    return useContext(UserEventContext);
}