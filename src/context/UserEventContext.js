"use client";
import { createContext, useContext } from 'react'
import { useWatchContractEvent, useAccount, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { userQueryKeys, providerQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const UserEventContext = createContext();

/**
 * Simplified User Event Provider
 * Only handles blockchain events and validates/updates React Query cache
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function UserEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name?.toLowerCase()];
    const queryClient = useQueryClient();
    const publicClient = usePublicClient({ chainId: safeChain.id });
    const isEnabled = !!contractAddress && !!safeChain.id && !!publicClient;

    // ProviderAdded event listener - simple cache invalidation
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderAdded',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('🏢 [UserEventContext] ProviderAdded events detected:', logs.length);
            
            // Invalidate provider list (new provider added to array)
            queryClient.invalidateQueries({ 
                queryKey: providerQueryKeys.list() 
            });
            
            // Invalidate specific provider queries for each added provider
            logs.forEach(log => {
                const providerAddress = log.args._account;
                if (providerAddress) {
                    queryClient.invalidateQueries({ 
                        queryKey: providerQueryKeys.byAddress(providerAddress) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: providerQueryKeys.isLabProvider(providerAddress) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: userQueryKeys.providerStatus(providerAddress) 
                    });
                }
            });
        }
    });

    // ProviderRemoved event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderRemoved',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('🗑️ [UserEventContext] ProviderRemoved events detected:', logs.length);
            
            // Invalidate provider list (provider removed from array)
            queryClient.invalidateQueries({ 
                queryKey: providerQueryKeys.list() 
            });
            
            // Invalidate specific provider queries for each removed provider
            logs.forEach(log => {
                const providerAddress = log.args._account;
                if (providerAddress) {
                    queryClient.invalidateQueries({ 
                        queryKey: providerQueryKeys.byAddress(providerAddress) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: providerQueryKeys.isLabProvider(providerAddress) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: userQueryKeys.providerStatus(providerAddress) 
                    });
                }
            });
        }
    });

    // ProviderUpdated event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'ProviderUpdated',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('📝 [UserEventContext] ProviderUpdated events detected:', logs.length);
            
            logs.forEach(log => {
                const providerAddress = log.args._account;
                if (providerAddress) {
                    // Invalidate specific provider data that changed
                    queryClient.invalidateQueries({ 
                        queryKey: providerQueryKeys.byAddress(providerAddress) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: providerQueryKeys.name(providerAddress) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: userQueryKeys.byAddress(providerAddress) 
                    });
                }
            });
        }
    });

    return (
        <UserEventContext.Provider value={{}}>
            {children}
        </UserEventContext.Provider>
    );
}

UserEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

/**
 * Hook to use the User Event Context
 * @returns {Object} User event context value
 */
export function useUserEventContext() {
    const context = useContext(UserEventContext);
    if (context === undefined) {
        throw new Error('useUserEventContext must be used within a UserEventProvider');
    }
    return context;
}
