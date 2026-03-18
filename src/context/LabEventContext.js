"use client";
import { createContext, useContext, useCallback, useRef } from 'react'
import { useWatchContractEvent, useConnection, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'
import { useOptimisticUI } from '@/context/OptimisticUIContext'

const LabEventContext = createContext();

// Utility to avoid duplicate invalidations in the same log batch
const uniqueIdsFromLogs = (logs, extractFn) => {
    const set = new Set();
    logs.forEach((log) => {
        const id = extractFn(log);
        if (id) set.add(id);
    });
    return Array.from(set);
};

const safeExtractLabId = (log) =>
    log?.args?._labId?.toString?.() ||
    log?.args?.labId?.toString?.() ||
    log?.args?.tokenId?.toString?.();

const getLabIdVariants = (labId) => {
    if (labId === undefined || labId === null || labId === '') return [];

    const variants = new Set([labId, String(labId)]);
    const numericId = Number(labId);
    if (!Number.isNaN(numericId)) {
        variants.add(numericId);
    }

    return Array.from(variants);
};

/**
 * Simplified Lab Event Provider
 * Only handles blockchain events and validates/updates React Query cache
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function LabEventProvider({ children }) {
    const { chain } = useConnection();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name?.toLowerCase()];
    const queryClient = useQueryClient();
    const publicClient = usePublicClient({ chainId: safeChain.id });

    // Debug log for enabled state
    const isEnabled = !!contractAddress && !!safeChain.id && !!publicClient;

    // Optimistic UI helpers (clearers)
    const { clearOptimisticListingState, clearOptimisticLabState } = useOptimisticUI();

    // Debounced invalidation queue (coalesces multiple invalidations into a single flush)
    const pendingInvalidationsRef = useRef(new Map());
    const flushTimeoutRef = useRef(null);

    const queueInvalidation = useCallback((queryKey) => {
        if (!queryKey) return;
        const keyStr = JSON.stringify(queryKey);
        pendingInvalidationsRef.current.set(keyStr, queryKey);

        if (flushTimeoutRef.current) return;

        flushTimeoutRef.current = setTimeout(() => {
            const queued = Array.from(pendingInvalidationsRef.current.values());
            pendingInvalidationsRef.current.clear();
            flushTimeoutRef.current = null;

            queued.forEach((qk) => {
                queryClient.invalidateQueries({ queryKey: qk, exact: true });
            });
        }, 50);
    }, [queryClient]);

    const queueLabDerivedInvalidations = useCallback((labId) => {
        if (!labId) return;
        getLabIdVariants(labId).forEach((candidateId) => {
            const derivedKeys = labQueryKeys.derivedByLabId ? labQueryKeys.derivedByLabId(candidateId) : [];
            derivedKeys.forEach((qk) => queueInvalidation(qk));
        });
    }, [queueInvalidation]);

    // LabAdded event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabAdded',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('🏗️ [LabEventContext] LabAdded events detected:', logs.length);
            
            // LabAdded changes the lab set -> invalidate getAllLabs
            queueInvalidation(labQueryKeys.getAllLabs());

            // If labId is available, invalidate derived queries for those new labs
            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                queueLabDerivedInvalidations(labId);
            });
        }
    });

    // LabUpdated event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUpdated',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('🔄 [LabEventContext] LabUpdated events detected:', logs.length);
            
            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                // Fine-grained invalidation for this lab only (avoid refetching the entire list)
                queueLabDerivedInvalidations(labId);

                // Clear any optimistic edit state now confirmed on chain
                try {
                  clearOptimisticLabState(String(labId));
                } catch (err) {
                  devLog.warn('Failed to clear optimistic lab state after LabUpdated event:', err);
                }
            });
        }
    });

    // LabListed event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabListed',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('📋 [LabEventContext] LabListed events detected:', logs.length, logs);
            
            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                getLabIdVariants(labId).forEach((candidateId) => {
                    queueInvalidation(labQueryKeys.getLab(candidateId));
                    queueInvalidation(labQueryKeys.isTokenListed(candidateId));
                });

                // Clear any optimistic listing/lab state now that chain confirmed the listing
                try {
                  clearOptimisticListingState(String(labId));
                  clearOptimisticLabState(String(labId));
                } catch (err) {
                  devLog.warn('Failed to clear optimistic state after LabListed event:', err);
                }
            });
        }
    });

    // LabUnlisted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUnlisted',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('📋 [LabEventContext] LabUnlisted events detected:', logs.length, logs);
            
            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                getLabIdVariants(labId).forEach((candidateId) => {
                    queueInvalidation(labQueryKeys.getLab(candidateId));
                    queueInvalidation(labQueryKeys.isTokenListed(candidateId));
                });

                // Clear any optimistic listing/lab state now that chain confirmed the unlisting
                try {
                  clearOptimisticListingState(String(labId));
                  clearOptimisticLabState(String(labId));
                } catch (err) {
                  devLog.warn('Failed to clear optimistic state after LabUnlisted event:', err);
                }
            });
        }
    });

    // LabDeleted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('🗑️ [LabEventContext] LabDeleted events detected:', logs.length);
            
            const deletedIds = uniqueIdsFromLogs(logs, safeExtractLabId);

            deletedIds.forEach((labId) => {
                // Remove (not invalidate) the per-lab derived queries so that active
                // useQueries subscribers (e.g. useLabsForMarket) don't immediately
                // fire a refetch for a non-existent lab and get 500 errors.
                getLabIdVariants(labId).forEach((candidateId) => {
                    const derivedKeys = labQueryKeys.derivedByLabId ? labQueryKeys.derivedByLabId(candidateId) : [];
                    derivedKeys.forEach((qk) => {
                        queryClient.removeQueries({ queryKey: qk, exact: true });
                    });
                });

                // Clear any optimistic lab/listing state
                try {
                  clearOptimisticLabState(String(labId));
                  clearOptimisticListingState(String(labId));
                } catch (err) {
                  devLog.warn('Failed to clear optimistic state after LabDeleted event:', err);
                }
            });

            // Synchronously remove the deleted lab IDs from the getAllLabs cache so
            // that useLabsForMarket re-renders immediately without the deleted lab,
            // preventing useQueries from subscribing to its per-lab queries while
            // getAllLabs is still being refetched in the background.
            queryClient.setQueryData(labQueryKeys.getAllLabs(), (oldData) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;
                return oldData.filter(
                    (id) => !deletedIds.includes(String(Number(id)))
                );
            });

            // Also refetch getAllLabs to confirm the updated set from the chain
            queryClient.invalidateQueries({ queryKey: labQueryKeys.getAllLabs(), exact: true });
        }
    });

    // LabURISet event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabURISet',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('🔗 [LabEventContext] LabURISet events detected:', logs.length);
            
            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                // Invalidate queries affected by URI change
                queueInvalidation(labQueryKeys.getLab(labId));
                queueInvalidation(labQueryKeys.tokenURI(labId));
            });
        }
    });

    // LabReputationAdjusted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabReputationAdjusted',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('[LabEventContext] LabReputationAdjusted events detected:', logs.length);

            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                queueLabDerivedInvalidations(labId);
            });
        }
    });

    // LabReputationSet event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabReputationSet',
        chainId: safeChain.id,
        client: publicClient,
        enabled: isEnabled, // Only enable when we have valid address and public client
        onLogs: (logs) => {
            devLog.log('[LabEventContext] LabReputationSet events detected:', logs.length);

            uniqueIdsFromLogs(logs, safeExtractLabId).forEach((labId) => {
                queueLabDerivedInvalidations(labId);
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
