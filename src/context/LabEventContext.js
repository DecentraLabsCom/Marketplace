"use client";
import { createContext, useContext, useState } from 'react'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { useNotifications } from '@/context/NotificationContext'
import { useLabCacheUpdates } from '@/hooks/lab/useLabs'
import { useQueryClient } from '@tanstack/react-query'
import { QUERY_KEYS } from '@/hooks/lab/useLabs'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { selectChain } from '@/utils/blockchain/selectChain'
import devLog from '@/utils/dev/logger'
import PropTypes from 'prop-types'

const LabEventContext = createContext();

/**
 * Provider for lab-related blockchain events
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function LabEventProvider({ children }) {
    const { chain, address } = useAccount();
    const safeChain = selectChain(chain);
    const contractAddress = contractAddresses[safeChain.name.toLowerCase()];
    const queryClient = useQueryClient();
    const labCacheUpdates = useLabCacheUpdates();
    const { addPersistentNotification } = useNotifications();
    const [processingLabs, setProcessingLabs] = useState(new Set());

    // Manual update coordination system (prevents UI + blockchain event duplicates)
    const [manualUpdateInProgress, setManualUpdateInProgress] = useState(false);

    // Function to check if manual update is in progress
    const isManualUpdateInProgress = manualUpdateInProgress;

    /**
     * Smart lab cache update - tries granular first, falls back to invalidation
     * @param {string|number} labId - Lab ID
     * @param {Object} [labData] - Lab data for granular updates
     * @param {string} [action] - Action type: 'add', 'remove', 'update'
     * @param {string} [reason] - Reason for cache update
     */
    const updateLabCaches = async (labId = null, labData = null, action = null, reason = 'event') => {
        devLog.log(`🎯 [LabEventContext] Smart cache update (reason: ${reason}):`, { labId, action });
        
        // Try granular update first if we have lab data and action
        if (labData && action && labId) {
            try {
                labCacheUpdates.smartLabInvalidation(labId, labData, action);
                devLog.log(`✅ [LabEventContext] Granular cache update completed`);
                return;
            } catch (error) {
                devLog.warn('⚠️ Granular lab update failed, falling back to invalidation:', error);
            }
        }
        
        // Fallback to traditional invalidation using React Query directly
        queryClient.invalidateQueries({ 
            queryKey: QUERY_KEYS.LAB.all 
        });

        // Also invalidate lab data if specific labId
        if (labId) {
            queryClient.invalidateQueries({ 
                queryKey: QUERY_KEYS.LAB.byId(labId) 
            });
        }

        devLog.log(`✅ [LabEventContext] Cache update completed`);
    };

    // LabAdded event listener (instead of LabCreated)
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabAdded',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabAdded event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { _labId, _provider, _uri, _price, _auth, _accessURI, _accessKey } = log.args;
                    
                    devLog.log('🏗️ [LabEventContext] LabAdded event received:', {
                        labId: _labId?.toString(),
                        provider: _provider,
                        uri: _uri,
                        price: _price?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for new lab
                    await updateLabCaches(
                        _labId?.toString(),
                        {
                            id: _labId?.toString(),
                            provider: _provider,
                            uri: _uri,
                            price: _price?.toString(),
                            auth: _auth,
                            accessURI: _accessURI,
                            accessKey: _accessKey,
                            timestamp: new Date().toISOString()
                        },
                        'add',
                        'lab_added'
                    );

                    // Show notification
                    addPersistentNotification(
                        `New lab added: Lab ${_labId?.toString()}`,
                        'success',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabAdded event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // LabUpdated event listener (instead of LabStatusChanged)
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabUpdated',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabUpdated event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { _labId, _uri, _price, _auth, _accessURI, _accessKey } = log.args;
                    
                    devLog.log('🔄 [LabEventContext] LabUpdated event received:', {
                        labId: _labId?.toString(),
                        uri: _uri,
                        price: _price?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for lab update
                    await updateLabCaches(
                        _labId?.toString(),
                        {
                            id: _labId?.toString(),
                            uri: _uri,
                            price: _price?.toString(),
                            auth: _auth,
                            accessURI: _accessURI,
                            accessKey: _accessKey,
                            timestamp: new Date().toISOString()
                        },
                        'update',
                        'lab_updated'
                    );

                    // Show notification
                    addPersistentNotification(
                        `Lab ${_labId?.toString()} has been updated`,
                        'info',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabUpdated event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // LabURISet event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabURISet',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabURISet event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { _labId, _uri } = log.args;
                    
                    devLog.log('🔄 [LabEventContext] LabURISet event received:', {
                        labId: _labId?.toString(),
                        uri: _uri,
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for lab URI change
                    await updateLabCaches(
                        _labId?.toString(),
                        {
                            id: _labId?.toString(),
                            uri: _uri,
                            timestamp: new Date().toISOString()
                        },
                        'update',
                        'lab_uri_set'
                    );

                    // Show notification
                    addPersistentNotification(
                        `Lab ${_labId?.toString()} metadata URI has been updated`,
                        'info',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabURISet event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    // LabDeleted event listener
    useWatchContractEvent({
        address: contractAddress,
        abi: contractABI,
        eventName: 'LabDeleted',
        onLogs: async (logs) => {
            if (manualUpdateInProgress) {
                devLog.log('[LabEventContext] Skipping LabDeleted event - manual update in progress');
                return;
            }

            for (const log of logs) {
                try {
                    const { _labId } = log.args;
                    
                    devLog.log('🗑️ [LabEventContext] LabDeleted event received:', {
                        labId: _labId?.toString(),
                        timestamp: new Date().toISOString()
                    });

                    // Smart cache update for lab deletion
                    await updateLabCaches(
                        _labId?.toString(),
                        null,
                        'remove',
                        'lab_deleted'
                    );
                    
                    // Note: For lab deletion, we may also need to clean up related bookings
                    // This could be done granularly in the future

                    // Show notification
                    addPersistentNotification(
                        `Lab ${_labId?.toString()} has been deleted`,
                        'warning',
                        5000
                    );

                } catch (error) {
                    devLog.error('❌ [LabEventContext] Error processing LabDeleted event:', error);
                }
            }
        },
        enabled: !!contractAddress && !!address,
    });

    const value = {
        processingLabs,
        setProcessingLabs,
        isManualUpdateInProgress,
        setManualUpdateInProgress,
        updateLabCaches,
        // Expose granular cache utilities for manual UI usage
        ...labCacheUpdates
    };

    return (
        <LabEventContext.Provider value={value}>
            {children}
        </LabEventContext.Provider>
    );
}

export function useLabEvents() {
    const context = useContext(LabEventContext);
    if (!context) {
        throw new Error('useLabEvents must be used within a LabEventProvider');
    }
    return context;
}

// PropTypes
LabEventProvider.propTypes = {
    children: PropTypes.node.isRequired,
};
