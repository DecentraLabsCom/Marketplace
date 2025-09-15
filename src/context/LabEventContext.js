"use client";
import { createContext, useContext } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import { useOptimisticUI } from '@/context/OptimisticUIContext'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const LabEventContext = createContext();

/**
 * Simplified Lab Event Provider
 * Only handles blockchain events and validates/updates React Query cache
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function LabEventProvider({ children }) {
    const { chain } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name?.toLowerCase()];
    const queryClient = useQueryClient();
    const { clearOptimisticListingState } = useOptimisticUI();

    // Debug log for enabled state
    const isEnabled = !!contractAddress && !!safeChain.id;

    // LabAdded event listener - simple cache invalidation
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabAdded',
        enabled: isEnabled, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('🏗️ [LabEventContext] LabAdded events detected:', logs.length);
            
            // Simple invalidation - let React Query handle the rest
            queryClient.invalidateQueries({ 
                queryKey: labQueryKeys.getAllLabs() 
            });
            
            // Invalidate specific lab queries if we have labId
            logs.forEach(log => {
                const labId = log.args._labId?.toString();
                if (labId) {
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.getLab(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.isTokenListed(labId) 
                    });
                }
            });
        }
    });

    // LabUpdated event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUpdated',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('🔄 [LabEventContext] LabUpdated events detected:', logs.length);
            
            logs.forEach(log => {
                const labId = log.args._labId?.toString();
                if (labId) {
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.getLab(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.tokenURI(labId) 
                    });
                }
            });
            
            // Also invalidate the list in case lab data affects listing
            queryClient.invalidateQueries({ 
                queryKey: labQueryKeys.getAllLabs() 
            });
        }
    });

    // LabListed event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabListed',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('📋 [LabEventContext] LabListed events detected:', logs.length);
            
            logs.forEach(log => {
                const labId = log.args._labId?.toString();
                if (labId) {
                    // Clear optimistic state - blockchain has confirmed the change
                    clearOptimisticListingState(labId);
                    
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.getLab(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.isTokenListed(labId) 
                    });
                }
            });
            
            queryClient.invalidateQueries({ 
                queryKey: labQueryKeys.getAllLabs() 
            });
        }
    });

    // LabUnlisted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUnlisted',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('📋 [LabEventContext] LabUnlisted events detected:', logs.length);
            
            logs.forEach(log => {
                const labId = log.args._labId?.toString();
                if (labId) {
                    // Clear optimistic state - blockchain has confirmed the change
                    clearOptimisticListingState(labId);
                    
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.getLab(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.isTokenListed(labId) 
                    });
                }
            });
            
            queryClient.invalidateQueries({ 
                queryKey: labQueryKeys.getAllLabs() 
            });
        }
    });

    // LabDeleted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('🗑️ [LabEventContext] LabDeleted events detected:', logs.length);
            
            logs.forEach(log => {
                const labId = log.args._labId?.toString();
                if (labId) {
                    // For deleted labs, invalidate all related queries
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.getLab(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.tokenURI(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.isTokenListed(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.ownerOf(labId) 
                    });
                }
            });
            
            queryClient.invalidateQueries({ 
                queryKey: labQueryKeys.getAllLabs() 
            });
        }
    });

    // LabURISet event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabURISet',
        enabled: !!contractAddress && !!safeChain.id, // Only enable when we have valid address
        onLogs: (logs) => {
            devLog.log('🔗 [LabEventContext] LabURISet events detected:', logs.length);
            
            logs.forEach(log => {
                const labId = log.args._labId?.toString();
                if (labId) {
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.getLab(labId) 
                    });
                    queryClient.invalidateQueries({ 
                        queryKey: labQueryKeys.tokenURI(labId) 
                    });
                }
            });
            
            // URI changes might affect lab display in lists
            queryClient.invalidateQueries({ 
                queryKey: labQueryKeys.getAllLabs() 
            });
        }
    });

    return (
        <LabEventContext.Provider value={{}}>
            {children}
        </LabEventContext.Provider>
    );
}

LabEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

/**
 * Hook to use the Lab Event Context
 * @returns {Object} Lab event context value
 */
export function useLabEventContext() {
    const context = useContext(LabEventContext);
    if (context === undefined) {
        throw new Error('useLabEventContext must be used within a LabEventProvider');
    }
    return context;
}